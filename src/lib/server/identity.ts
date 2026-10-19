// Identity Platform (Firebase Auth) on the server: session cookies, custom
// tokens for PowerSync, custom claims and revocation (infrastructure.md §3).
// This file only wraps the Admin SDK. Guad never stores passwords or builds
// its own tokens (constitution principle 7).
import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth, type DecodedIdToken } from 'firebase-admin/auth';
import { SignJWT } from 'jose';

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
): Promise<{ cookie: string; uid: string; expiresIn: number; secondFactor: boolean }> {
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
	// Set by Identity Platform when this sign-in passed a TOTP challenge.
	const secondFactor = Boolean(decoded.firebase?.sign_in_second_factor);
	return { cookie, uid: decoded.uid, expiresIn, secondFactor };
}

/**
 * Verifies a witness's ID token from a sign-in on someone else's device
 * (controlled medication count book). It must be a sign-in from the last five
 * minutes; the token is used once and never stored. Returns null if invalid.
 */
export async function verifyWitnessSignIn(
	idToken: string
): Promise<{ uid: string; secondFactor: boolean } | null> {
	try {
		const decoded = await auth().verifyIdToken(idToken, true);
		if (Date.now() / 1000 - decoded.auth_time > RECENT_SIGN_IN_S) return null;
		return { uid: decoded.uid, secondFactor: Boolean(decoded.firebase?.sign_in_second_factor) };
	} catch {
		return null;
	}
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

/**
 * Whether sign-in enforces the MFA policy. Off with the Auth emulator, which
 * can't do TOTP, or when MFA_ENFORCE=off (e.g. a staging project before
 * Identity Platform's TOTP is switched on).
 */
export function mfaEnforced(): boolean {
	return !process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.MFA_ENFORCE !== 'off';
}

/** Signs the user out everywhere: existing session cookies stop verifying. */
export async function revokeSessions(uid: string): Promise<void> {
	await auth().revokeRefreshTokens(uid);
}

/**
 * What the browser needs to get a PowerSync token, after the session cookie
 * was verified:
 * - production: a Firebase custom token, exchanged with signInWithCustomToken
 *   for a 1-hour Identity Platform ID token that PowerSync verifies against
 *   Google's JWKS;
 * - local dev with the Auth emulator: the emulator's tokens are unsigned, so
 *   the server signs a 1-hour PowerSync token with the dev-only key that
 *   powersync/service.yaml trusts. Never used outside the emulator.
 *
 * Either way the token carries only the user ID; the sync streams look up the
 * profile (agency, role, homes, active) live (offline-sync.md §4).
 */
export type SyncCredential =
	| { kind: 'custom-token'; customToken: string }
	| { kind: 'powersync-token'; token: string; expiresAt: string };

export const DEV_POWERSYNC_AUDIENCE = 'guad-local';
const DEV_POWERSYNC_KID = 'guad-local-1';

export async function createSyncCredential(uid: string): Promise<SyncCredential> {
	const devKey = process.env.PS_DEV_JWT_KEY;
	if (process.env.FIREBASE_AUTH_EMULATOR_HOST && devKey) {
		const expires = new Date(Date.now() + 60 * 60 * 1000);
		const token = await new SignJWT({})
			.setProtectedHeader({ alg: 'HS256', kid: DEV_POWERSYNC_KID })
			.setSubject(uid)
			.setAudience(DEV_POWERSYNC_AUDIENCE)
			.setIssuedAt()
			.setExpirationTime(expires)
			.sign(Buffer.from(devKey, 'base64url'));
		return { kind: 'powersync-token', token, expiresAt: expires.toISOString() };
	}
	return { kind: 'custom-token', customToken: await auth().createCustomToken(uid) };
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

/** Reactivation: the account can sign in again (old sessions stay revoked). */
export async function enableIdentity(uid: string): Promise<void> {
	await auth().updateUser(uid, { disabled: false });
}

/**
 * Lost authenticator (security.md "MFA Policy"): removes every enrolled
 * second factor and ends the user's sessions; they enroll again at next sign-in.
 */
export async function resetSecondFactors(uid: string): Promise<void> {
	await auth().updateUser(uid, { multiFactor: { enrolledFactors: null } });
	await auth().revokeRefreshTokens(uid);
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
