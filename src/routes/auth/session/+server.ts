import { error, json } from '@sveltejs/kit';
import { dev } from '$app/env';
import { z } from 'zod';
import {
	createSession,
	mfaEnforced,
	revokeSessions,
	SESSION_COOKIE,
	SignInError,
	verifySession
} from '#lib/server/identity.ts';
import { checkMfa, getCurrentUser } from '#lib/server/services/auth/index.ts';
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

	// MFA policy (security.md): no session without TOTP when the role needs it.
	// The browser still holds the signed-in Firebase user, so it can enroll now.
	let mfaGraceDaysLeft: number | undefined;
	if (mfaEnforced()) {
		const mfa = await checkMfa(user, session.secondFactor);
		if (!mfa.satisfied) {
			return json(
				{
					code: 'mfa_enrollment_required',
					message: 'Your role needs two-step sign-in. Set up an authenticator app to continue.'
				},
				{ status: 403 }
			);
		}
		if (mfa.kind === 'grace' && !session.secondFactor) mfaGraceDaysLeft = mfa.daysLeft;
	}

	cookies.set(SESSION_COOKIE, session.cookie, {
		path: '/',
		httpOnly: true,
		secure: !dev,
		sameSite: 'lax',
		maxAge: Math.floor(session.expiresIn / 1000)
	});
	return json({ ok: true, role: user.role, mfaGraceDaysLeft });
};

/** DELETE: sign out here and revoke sessions on every device. */
export const DELETE: RequestHandler = async ({ cookies }) => {
	const session = await verifySession(cookies.get(SESSION_COOKIE));
	if (session) await revokeSessions(session.uid);
	cookies.delete(SESSION_COOKIE, { path: '/' });
	return json({ ok: true });
};
