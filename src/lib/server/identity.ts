// Identity Platform (Firebase Auth) on the server: session cookies, custom
// tokens for PowerSync, custom claims and revocation (infrastructure.md §3).
// This file only wraps the Admin SDK. Guad never stores passwords or builds
// its own tokens (constitution principle 7).
import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth, type DecodedIdToken } from 'firebase-admin/auth';

/** Session cookie lifetime. security.md: 12 hours, agencies may shorten it. */
export const SESSION_MAX_MS = 12 * 60 * 60 * 1000;
/** Identity Platform requires a recent sign-in to mint a session cookie. */
const RECENT_SIGN_IN_S = 5 * 60;

export const SESSION_COOKIE = '__session';

let app: App | undefined;

function auth(): Auth {
	if (!app) {
		// On Cloud Run the project and credentials come from the service account.
		// Locally FIREBASE_AUTH_EMULATOR_HOST points the SDK at the emulator.
		// (SvelteKit keeps PUBLIC_* variables out of server code, so use the
		// server-side name; scripts and tests may still pass the public one.)
		const projectId = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.PUBLIC_FIREBASE_PROJECT_ID;
		app = getApps()[0] ?? initializeApp(projectId ? { projectId } : undefined);
	}
	return getAuth(app);
}

/** Claims PowerSync reads as token_parameters.* (offline-sync.md §4). */
export interface SyncClaims {
	agency_id: string;
	role: 'caregiver' | 'supervisor' | 'admin';
	profile_id: string;
}

export class SignInError extends Error {
	constructor(
		public readonly code: 'stale_sign_in' | 'invalid_token',
		message: string
	) {
		super(message);
	}
}

/**
 * Exchanges a fresh ID token from the browser for a session cookie.
 * Returns the cookie value and the user's Identity Platform UID.
 */
export async function createSession(
	idToken: string,
	maxMs: number = SESSION_MAX_MS
): Promise<{ cookie: string; uid: string; expiresIn: number }> {
	let decoded: DecodedIdToken;
	try {
		decoded = await auth().verifyIdToken(idToken, true);
	} catch {
		throw new SignInError('invalid_token', 'Sign-in could not be verified');
	}
	if (Date.now() / 1000 - decoded.auth_time > RECENT_SIGN_IN_S) {
		throw new SignInError('stale_sign_in', 'Please sign in again');
	}
	const expiresIn = Math.min(maxMs, SESSION_MAX_MS);
	const cookie = await auth().createSessionCookie(idToken, { expiresIn });
	return { cookie, uid: decoded.uid, expiresIn };
}

/**
 * Verifies a session cookie, including revocation, so a deactivated or
 * signed-out user is rejected on the next request. Returns null when invalid.
 */
export async function verifySession(cookie: string | undefined): Promise<{ uid: string } | null> {
	if (!cookie) return null;
	try {
		const decoded = await auth().verifySessionCookie(cookie, true);
		return { uid: decoded.uid };
	} catch {
		return null;
	}
}

/** Signs the user out everywhere: existing session cookies stop verifying. */
export async function revokeSessions(uid: string): Promise<void> {
	await auth().revokeRefreshTokens(uid);
}

/**
 * A Firebase custom token the browser exchanges for an in-memory ID token,
 * which PowerSync uses. Only called after the session cookie was verified.
 */
export async function createSyncToken(uid: string): Promise<string> {
	return auth().createCustomToken(uid);
}

/**
 * Sets the claims PowerSync routes on, then revokes refresh tokens so the
 * next token carries them. Call when a profile is created or its role,
 * homes or agency change.
 */
export async function setSyncClaims(uid: string, claims: SyncClaims): Promise<void> {
	await auth().setCustomUserClaims(uid, { parameters: claims });
	await auth().revokeRefreshTokens(uid);
}

export interface NewIdentity {
	email: string;
	displayName: string;
	/** Dev and test only. Real users set their own password from the invite link. */
	password?: string;
}

/** Creates the Identity Platform user for an invited staff member. */
export async function createIdentity(user: NewIdentity): Promise<string> {
	const created = await auth().createUser({
		email: user.email,
		displayName: user.displayName,
		password: user.password,
		emailVerified: false
	});
	return created.uid;
}

/** Link the invite email points to, where the user sets a password. */
export async function passwordSetupLink(email: string, continueUrl: string): Promise<string> {
	return auth().generatePasswordResetLink(email, { url: continueUrl });
}

/** Deactivation: the account can't sign in and existing sessions end. */
export async function disableIdentity(uid: string): Promise<void> {
	await auth().updateUser(uid, { disabled: true });
	await auth().revokeRefreshTokens(uid);
}

/** Test helper: removes an identity created by a test. */
export async function deleteIdentity(uid: string): Promise<void> {
	await auth().deleteUser(uid);
}
