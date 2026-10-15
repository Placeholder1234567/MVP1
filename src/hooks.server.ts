import { existsSync } from 'node:fs';
import { error } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { dev } from '$app/env';

// Server modules (db, identity) read process.env so they also work in scripts
// and tests. Vite doesn't copy .env there, so do it in dev. Cloud Run sets the
// real environment in production.
if (dev && existsSync('.env')) process.loadEnvFile('.env');
import { SESSION_COOKIE, verifySession } from '#lib/server/identity.ts';
import { getCurrentUser } from '#lib/server/services/auth/index.ts';
import { startLocalSchedule } from '#lib/server/jobs/schedule.ts';

// Start after loading local settings; production uses Cloud Scheduler.
if (dev) startLocalSchedule();

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const handle: Handle = async ({ event, resolve }) => {
	// CSRF (security.md T7): state-changing requests must come from our own pages.
	// SvelteKit already checks form posts; this also covers fetch() JSON calls.
	// Webhook and job routes authenticate by signature or OIDC token instead.
	const { pathname } = event.url;
	const exempt = pathname.startsWith('/api/webhooks/') || pathname.startsWith('/api/jobs/');
	// The worker service serves only job and webhook routes, which check a
	// Google OIDC token or an SNS signature themselves (deploy/README.md).
	if (process.env.GUAD_SERVICE === 'worker' && !exempt) error(404, 'Not found');
	if (UNSAFE.has(event.request.method) && !exempt) {
		const origin = event.request.headers.get('origin');
		if (origin !== event.url.origin) error(403, 'Cross-site request blocked');
	}

	event.locals.user = null;
	const session = await verifySession(event.cookies.get(SESSION_COOKIE));
	if (session) {
		// A verified cookie with no active profile (deactivated, or never set
		// up) is treated as signed out.
		event.locals.user = await getCurrentUser(session.uid);
		if (!event.locals.user) event.cookies.delete(SESSION_COOKIE, { path: '/' });
	}

	const response = await resolve(event);
	// No caching of anything that might carry client data (security.md).
	if (event.locals.user) response.headers.set('cache-control', 'private, no-store');
	return response;
};
