import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { error } from '@sveltejs/kit';
import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { dev } from '$app/env';

// Server modules (db, identity) read process.env so they also work in scripts
// and tests. Vite doesn't copy .env there, so do it in dev. Cloud Run sets the
// real environment in production.
if (dev && existsSync('.env')) process.loadEnvFile('.env');
import { SESSION_COOKIE, verifySession } from '#lib/server/identity.ts';
import { getCurrentUser } from '#lib/server/services/auth/index.ts';
import { startLocalSchedule } from '#lib/server/jobs/schedule.ts';
import {
	runtimeConnectSources,
	securityHeaders,
	withConnectSources
} from '#lib/server/security-headers.ts';

// Start after loading local settings; production uses Cloud Scheduler.
if (dev) startLocalSchedule();

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const handle: Handle = async ({ event, resolve }) => {
	// CSRF (security.md T7): state-changing requests must come from our own pages.
	// This covers every content type (SvelteKit's form-only check is off, see vite.config.ts).
	// Webhook and job routes authenticate by signature or OIDC token instead.
	const { pathname } = event.url;
	const exempt = pathname.startsWith('/api/webhooks/') || pathname.startsWith('/api/jobs/');
	// The external API (openapi.yaml) authenticates by Bearer API key only and
	// ignores cookies, so a cross-site request can't act as a signed-in user.
	const bearerApi = pathname.startsWith('/api/v1/');
	// The worker service serves only job and webhook routes, which check a
	// Google OIDC token or an SNS signature themselves (deploy/README.md).
	if (process.env.GUAD_SERVICE === 'worker' && !exempt) error(404, 'Not found');
	if (UNSAFE.has(event.request.method) && !exempt && !bearerApi) {
		const origin = event.request.headers.get('origin');
		if (origin !== event.url.origin) error(403, 'Cross-site request blocked');
	}

	event.locals.user = null;
	event.locals.signedInAt = null;
	const session = await verifySession(event.cookies.get(SESSION_COOKIE));
	if (session) {
		// A verified cookie with no active profile (deactivated, or never set
		// up) is treated as signed out.
		event.locals.user = await getCurrentUser(session.uid);
		if (!event.locals.user) event.cookies.delete(SESSION_COOKIE, { path: '/' });
		else event.locals.signedInAt = session.authTime * 1000;
	}

	// Preload the Figtree file too (SvelteKit's default is JS and CSS only) so
	// first paint doesn't swap fonts.
	const response = await resolve(event, { preload: ({ type }) => type !== 'asset' });
	try {
		// No caching of anything that might carry client data (security.md).
		if (event.locals.user) response.headers.set('cache-control', 'private, no-store');
		for (const [name, value] of Object.entries(HEADERS)) response.headers.set(name, value);
		const csp = response.headers.get('content-security-policy');
		if (csp) response.headers.set('content-security-policy', withConnectSources(csp, CONNECT));
	} catch {
		// Some responses (e.g. proxied fetches) have immutable headers.
	}
	return response;
};

const HEADERS = securityHeaders(dev);
const CONNECT = runtimeConnectSources(process.env);

/**
 * Unexpected errors outside tRPC (page loads, /auth, jobs, webhooks). Their
 * messages can carry query parameters, i.e. client data, so the log gets an
 * operation ID, the error's name and any Postgres code, never the message
 * (CLAUDE.md: no PHI in logs). The user sees only the operation ID.
 */
export const handleError: HandleServerError = (input) => {
	// error(...) and framework errors (404s etc.) already carry safe messages.
	if (input.kind !== 'unknown') return;
	const opId = randomUUID().slice(0, 8);
	const err = input.error as { name?: string; code?: string; cause?: { code?: string } } | null;
	const pg = err?.code ?? err?.cause?.code;
	console.error(`server error op=${opId} ${err?.name ?? 'Error'}${pg ? ` pg=${pg}` : ''}`);
	return { message: `Something went wrong (ref: ${opId}). Try again.` };
};
