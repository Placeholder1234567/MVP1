import { error, json } from '@sveltejs/kit';
import { dev } from '$app/env';
import { z } from 'zod';
import {
	createSession,
	revokeSessions,
	SESSION_COOKIE,
	SignInError,
	verifySession
} from '#lib/server/identity.ts';
import { getCurrentUser } from '#lib/server/services/auth/index.ts';
import type { RequestHandler } from './$types';

const Body = z.object({ idToken: z.string().min(1).max(4096) });

/** POST { idToken }: exchange a fresh ID token for the session cookie. */
export const POST: RequestHandler = async ({ request, cookies }) => {
	const parsed = Body.safeParse(await request.json().catch(() => null));
	if (!parsed.success) error(400, 'Missing sign-in token');

	let session;
	try {
		session = await createSession(parsed.data.idToken);
	} catch (e) {
		if (e instanceof SignInError) error(401, e.message);
		throw e;
	}

	// An Identity Platform account alone isn't enough: it needs an active Guad profile.
	const user = await getCurrentUser(session.uid);
	if (!user) error(403, 'This account is not set up in Guad, or has been deactivated');

	cookies.set(SESSION_COOKIE, session.cookie, {
		path: '/',
		httpOnly: true,
		secure: !dev,
		sameSite: 'lax',
		maxAge: Math.floor(session.expiresIn / 1000)
	});
	return json({ ok: true, role: user.role });
};

/** DELETE: sign out here and revoke sessions on every device. */
export const DELETE: RequestHandler = async ({ cookies }) => {
	const session = await verifySession(cookies.get(SESSION_COOKIE));
	if (session) await revokeSessions(session.uid);
	cookies.delete(SESSION_COOKIE, { path: '/' });
	return json({ ok: true });
};
