// Firebase Auth in the browser. Tokens live in memory only (inMemoryPersistence):
// never localStorage, sessionStorage or IndexedDB (constitution principle 7).
// The durable session is the HttpOnly cookie set by /auth/session.
import * as env from '$app/env/public';
import { initializeApp, getApps } from 'firebase/app';
import {
	connectAuthEmulator,
	inMemoryPersistence,
	initializeAuth,
	signInWithCustomToken,
	signInWithEmailAndPassword,
	signOut,
	type Auth
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
				appId: env.PUBLIC_FIREBASE_APP_ID,
				messagingSenderId: env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
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

/** Email + password sign-in, then trade the ID token for the session cookie. */
export async function signIn(email: string, password: string): Promise<{ role: string }> {
	const cred = await signInWithEmailAndPassword(firebaseAuth(), email, password);
	const res = await postJson('/auth/session', { idToken: await cred.user.getIdToken() });
	if (!res.ok) {
		await signOut(firebaseAuth());
		throw new Error((await res.json().catch(() => null))?.message ?? 'Sign-in failed');
	}
	return res.json();
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
