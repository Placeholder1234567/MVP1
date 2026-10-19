// Sign-in flow against the local Auth emulator and Postgres
// (npm run test:integration starts the emulator for the run).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.PUBLIC_FIREBASE_PROJECT_ID ??= 'demo-guad';

const identity = await import('../../../src/lib/server/identity');
const { getCurrentUser, hasRole, sessionLengthMs } =
	await import('../../../src/lib/server/services/auth');
const { closeDb, withService } = await import('../../../src/lib/server/db');
const { agencies, profiles } = await import('../../../src/lib/server/db/schema');

const EMU = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`;
const PASSWORD = 'test-only-password-1';

/** What the browser SDK does: sign in with email + password, get an ID token. */
async function emulatorSignIn(email: string): Promise<string> {
	const res = await fetch(
		`${EMU}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`,
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true })
		}
	);
	const body = await res.json();
	if (!res.ok) throw new Error(body.error?.message ?? 'sign-in failed');
	return body.idToken;
}

/** What the browser does with the sync token: exchange it for an ID token. */
async function exchangeCustomToken(token: string): Promise<Record<string, unknown>> {
	const res = await fetch(
		`${EMU}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-key`,
		{
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ token, returnSecureToken: true })
		}
	);
	const { idToken } = await res.json();
	return JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString());
}

const agencyId = randomUUID();
const profileId = randomUUID();
const email = `session-${profileId}@example.test`;
let uid: string;

beforeAll(async () => {
	uid = await identity.createIdentity({ email, displayName: 'Session Test', password: PASSWORD });
	await withService(async (tx) => {
		await tx
			.insert(agencies)
			.values({
				id: agencyId,
				name: 'Session Test Agency',
				subscription_tier: 'complete',
				slug: `session-${agencyId}`
			});
		await tx.insert(profiles).values({
			id: profileId,
			agency_id: agencyId,
			auth_uid: uid,
			email,
			name: 'Session Test',
			role: 'supervisor'
		});
	});
});

afterAll(async () => {
	await identity.deleteIdentity(uid).catch(() => {});
	await closeDb();
});

describe('sign-in', () => {
	it('a fresh ID token becomes a session cookie that verifies', async () => {
		const session = await identity.createSession(await emulatorSignIn(email));
		expect(session.uid).toBe(uid);
		expect(session.expiresIn).toBe(identity.SESSION_MAX_MS);
		expect(await identity.verifySession(session.cookie)).toEqual({ uid });
	});

	it('uses the agency’s shorter session length when it sets one', async () => {
		expect(await sessionLengthMs(uid)).toBe(identity.SESSION_MAX_MS);
		await withService((tx) =>
			tx
				.update(agencies)
				.set({ settings: { session_minutes: 30 } })
				.where(eq(agencies.id, agencyId))
		);
		try {
			const session = await identity.createSession(await emulatorSignIn(email), sessionLengthMs);
			expect(session.expiresIn).toBe(30 * 60_000);
			expect(await identity.verifySession(session.cookie)).toEqual({ uid });
		} finally {
			await withService((tx) =>
				tx.update(agencies).set({ settings: {} }).where(eq(agencies.id, agencyId))
			);
		}
	});

	it('rejects a forged or missing token', async () => {
		await expect(identity.createSession('not-a-token')).rejects.toMatchObject({
			code: 'invalid_token'
		});
		expect(await identity.verifySession('not-a-cookie')).toBeNull();
		expect(await identity.verifySession(undefined)).toBeNull();
	});

	it('maps the session to the profile, with claims taken from the profile row', async () => {
		const user = await getCurrentUser(uid);
		expect(user).toMatchObject({
			profileId,
			agencyId,
			role: 'supervisor',
			timeZone: 'America/New_York',
			claims: { agency_id: agencyId, role: 'supervisor', profile_id: profileId }
		});
		expect(hasRole(user!, 'caregiver')).toBe(true);
		expect(hasRole(user!, 'admin')).toBe(false);
	});

	it('in emulator mode, the sync credential is a 1-hour PowerSync token for this user only', async () => {
		const { jwtVerify } = await import('jose');
		const key = 'gi3XNOLkX6khPVxN4PpCoi7zVjDi9lljHRkgCTItfss'; // .env.example dev key
		process.env.PS_DEV_JWT_KEY = key;
		try {
			const cred = await identity.createSyncCredential(uid);
			if (cred.kind !== 'powersync-token')
				throw new Error(`expected powersync-token, got ${cred.kind}`);
			const { payload, protectedHeader } = await jwtVerify(
				cred.token,
				Buffer.from(key, 'base64url'),
				{
					audience: identity.DEV_POWERSYNC_AUDIENCE
				}
			);
			expect(protectedHeader).toMatchObject({ alg: 'HS256', kid: 'guad-local-1' });
			expect(payload.sub).toBe(uid);
			expect(payload.exp! - payload.iat!).toBe(3600);
			// Only the user ID: streams look up agency, role and homes live.
			expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'sub']);
		} finally {
			delete process.env.PS_DEV_JWT_KEY;
		}
	});

	it('without the dev key, the sync credential is a Firebase custom token for this user', async () => {
		const cred = await identity.createSyncCredential(uid);
		if (cred.kind !== 'custom-token') throw new Error(`expected custom-token, got ${cred.kind}`);
		const claims = await exchangeCustomToken(cred.customToken);
		expect(claims.sub).toBe(uid);
	});

	it('signing out everywhere makes existing cookies stop verifying', async () => {
		const session = await identity.createSession(await emulatorSignIn(email));
		// Revocation has one-second granularity; a cookie minted in the same second survives.
		await new Promise((r) => setTimeout(r, 1100));
		await identity.revokeSessions(uid);
		expect(await identity.verifySession(session.cookie)).toBeNull();
	});

	it('a deactivated profile resolves to nobody', async () => {
		await withService((tx) =>
			tx.update(profiles).set({ active: false }).where(eq(profiles.id, profileId))
		);
		expect(await getCurrentUser(uid)).toBeNull();
	});
});
