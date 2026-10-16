// Firebase Auth in the browser. Tokens live in memory only (inMemoryPersistence):
// never localStorage, sessionStorage or IndexedDB (constitution principle 7).
// The durable session is the HttpOnly cookie set by /auth/session.
import * as env from '$app/env/public';
import { initializeApp, getApps } from 'firebase/app';
import {
	connectAuthEmulator,
	getMultiFactorResolver,
	inMemoryPersistence,
	initializeAuth,
	multiFactor,
	signInWithCustomToken,
	signInWithEmailAndPassword,
	signOut,
	TotpMultiFactorGenerator,
	type Auth,
	type MultiFactorError,
	type MultiFactorResolver,
	type TotpSecret,
	type User
} from 'firebase/auth';

let auth: Auth | undefined;

export function firebaseAuth(): Auth {
	if (!auth) {
		const app =
			getApps()[0] ??
			initializeApp({
				// Public identifiers, not secrets (CLAUDE.md "NO secrets in client bundle")
				apiKey: env.PUBLIC_FIREBASE_API_KEY || 'demo-key',
				authDomain: env.PUBLIC_FIREBASE_AUTH_DOMAIN,
				projectId: env.PUBLIC_FIREBASE_PROJECT_ID || 'demo-guad'
			});
		auth = initializeAuth(app, { persistence: inMemoryPersistence });
		if (env.PUBLIC_AUTH_EMULATOR_URL) {
			connectAuthEmulator(auth, env.PUBLIC_AUTH_EMULATOR_URL, { disableWarnings: true });
		}
	}
	return auth;
}

async function postJson(url: string, body?: unknown): Promise<Response> {
	return fetch(url, {
		method: body === undefined ? 'DELETE' : 'POST',
		headers: { 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body)
	});
}

export interface SessionResult {
	role: string;
	/** Days a supervisor can still sign in without two-step sign-in */
	mfaGraceDaysLeft?: number;
}

/** The account has TOTP: sign-in waits for the 6-digit code (completeMfaSignIn). */
export class MfaChallenge extends Error {
	constructor(readonly resolver: MultiFactorResolver) {
		super('Enter the code from your authenticator app.');
	}
}

/** The role needs TOTP and none is set up: enroll before a session is issued. */
export class MfaEnrollmentNeeded extends Error {}

/** Trades the signed-in user's ID token for the session cookie. */
async function startSession(user: User): Promise<SessionResult> {
	const res = await postJson('/auth/session', { idToken: await user.getIdToken(true) });
	const body = await res.json().catch(() => null);
	if (res.status === 403 && body?.code === 'mfa_enrollment_required') {
		// Keep the Firebase user signed in (memory only) so they can enroll now.
		throw new MfaEnrollmentNeeded(body.message);
	}
	if (!res.ok) {
		await signOut(firebaseAuth());
		throw new Error(body?.message ?? 'Sign-in failed');
	}
	return body;
}

/** Email + password sign-in, then trade the ID token for the session cookie. */
export async function signIn(email: string, password: string): Promise<SessionResult> {
	let user: User;
	try {
		user = (await signInWithEmailAndPassword(firebaseAuth(), email, password)).user;
	} catch (e) {
		if ((e as { code?: string }).code === 'auth/multi-factor-auth-required') {
			throw new MfaChallenge(getMultiFactorResolver(firebaseAuth(), e as MultiFactorError));
		}
		throw e;
	}
	return startSession(user);
}

/** Second step: the TOTP code for the challenge from signIn(). */
export async function completeMfaSignIn(
	resolver: MultiFactorResolver,
	code: string
): Promise<SessionResult> {
	const hint = resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
	if (!hint) throw new Error('No authenticator app is set up for this account.');
	const cred = await resolver.resolveSignIn(
		TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code)
	);
	return startSession(cred.user);
}

/** Enrollment, step 1: a new TOTP secret for the signed-in user. */
export async function startTotpEnrollment(): Promise<{
	secret: TotpSecret;
	key: string;
	otpauthUrl: string;
}> {
	const user = firebaseAuth().currentUser;
	if (!user) throw new Error('Sign in again to set up two-step sign-in.');
	const secret = await TotpMultiFactorGenerator.generateSecret(
		await multiFactor(user).getSession()
	);
	return {
		secret,
		key: secret.secretKey,
		otpauthUrl: secret.generateQrCodeUrl(user.email ?? 'Guad account', 'Guad')
	};
}

/**
 * Enrollment, step 2: confirm with a code from the app. The user then signs
 * in again, so the new session comes from a sign-in that used the factor.
 */
export async function finishTotpEnrollment(secret: TotpSecret, code: string): Promise<void> {
	const user = firebaseAuth().currentUser;
	if (!user) throw new Error('Sign in again to set up two-step sign-in.');
	await multiFactor(user).enroll(
		TotpMultiFactorGenerator.assertionForEnrollment(secret, code),
		'Authenticator app'
	);
	await signOut(firebaseAuth());
}

/**
 * The token PowerSync connects with, held in memory only. The server decides
 * the form (see createSyncCredential): in production a custom token we
 * exchange for an Identity Platform ID token; with the local emulator a
 * ready-made PowerSync token. The session cookie proves who we are.
 */
export async function getSyncToken(): Promise<{ token: string; expiresAt: Date }> {
	// Ask the server every time: even right after sign-in, an emulator ID token
	// is unsigned and PowerSync would reject it.
	const res = await fetch('/auth/sync-token', { method: 'POST' });
	if (!res.ok) throw new Error('Not signed in');
	const cred = await res.json();
	if (cred.kind === 'powersync-token') {
		return { token: cred.token, expiresAt: new Date(cred.expiresAt) };
	}
	const a = firebaseAuth();
	if (!a.currentUser) await signInWithCustomToken(a, cred.customToken);
	const result = await a.currentUser!.getIdTokenResult();
	return { token: result.token, expiresAt: new Date(result.expirationTime) };
}

export async function signOutEverywhere(): Promise<void> {
	await postJson('/auth/session');
	await signOut(firebaseAuth());
}
