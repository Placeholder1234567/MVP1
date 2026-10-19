// Device database keys (offline-sync.md "Local Database Encryption Key").
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
process.env.DEVICE_KEY_KEK ??= '5JnVufYPg_lWSqzmUZYV7FPssgpajWjvRoSXwToT8o0'; // .env.example

const { closeDb, withService, withUser } = await import('../../../src/lib/server/db');
const { agencies, deviceKeys, profiles } = await import('../../../src/lib/server/db/schema');
const {
	issueDeviceKey,
	revokeDeviceKeys,
	DeviceRevokedError,
	SignInAgainError,
	REISSUE_WINDOW_MS
} = await import('../../../src/lib/server/services/device');
const { getCurrentUser } = await import('../../../src/lib/server/services/auth');
const { appRouter } = await import('../../../src/lib/server/trpc/router');
const { createCallerFactory } = await import('../../../src/lib/server/trpc/middleware');

const AGENCY = randomUUID();
const CG = randomUUID();
const ADMIN = randomUUID();
const CG_UID = `dev-cg-${CG}`;
const ADMIN_UID = `dev-admin-${ADMIN}`;
const PHONE = randomUUID();
const TABLET = randomUUID();

beforeAll(async () => {
	await withService(async (tx) => {
		await tx
			.insert(agencies)
			.values({
				id: AGENCY,
				name: 'Device Test Agency',
				subscription_tier: 'complete',
				slug: `dev-${AGENCY}`
			});
		await tx.insert(profiles).values([
			{
				id: CG,
				agency_id: AGENCY,
				auth_uid: CG_UID,
				email: `${CG_UID}@example.test`,
				name: 'Cara',
				role: 'caregiver'
			},
			{
				id: ADMIN,
				agency_id: AGENCY,
				auth_uid: ADMIN_UID,
				email: `${ADMIN_UID}@example.test`,
				name: 'Ada',
				role: 'admin'
			}
		]);
	});
});

afterAll(closeDb);

describe('device keys', () => {
	it('issues a random 256-bit key, and the same key again for the same device', async () => {
		const first = await issueDeviceKey(AGENCY, CG, PHONE, Date.now());
		const again = await issueDeviceKey(AGENCY, CG, PHONE, Date.now());
		expect(first).toHaveLength(32);
		expect(again.equals(first)).toBe(true);
	});

	it('gives each device its own key', async () => {
		const phone = await issueDeviceKey(AGENCY, CG, PHONE, Date.now());
		const tablet = await issueDeviceKey(AGENCY, CG, TABLET, Date.now());
		expect(tablet.equals(phone)).toBe(false);
	});

	it('stores only ciphertext, never the key', async () => {
		const key = await issueDeviceKey(AGENCY, CG, PHONE, Date.now());
		const [row] = await withService((tx) =>
			tx
				.select({ ct: deviceKeys.key_ciphertext })
				.from(deviceKeys)
				.where(eq(deviceKeys.device_id, PHONE))
		);
		expect(row.ct).not.toContain(key.toString('base64url'));
		expect(Buffer.from(row.ct, 'base64url').includes(key)).toBe(false);
	});

	it('no user session can read device keys, not even an admin', async () => {
		const admin = (await getCurrentUser(ADMIN_UID))!;
		const rows = await withUser(admin.claims, {}, (tx) => tx.select().from(deviceKeys));
		expect(rows).toEqual([]);
	});

	it('a key sealed for one user cannot be opened as another (the profile is bound to the ciphertext)', async () => {
		await issueDeviceKey(AGENCY, CG, PHONE, Date.now());
		// Move the caregiver's row onto the admin: decryption must fail, not hand over the key.
		await withService((tx) =>
			tx.update(deviceKeys).set({ profile_id: ADMIN }).where(eq(deviceKeys.device_id, PHONE))
		);
		await expect(issueDeviceKey(AGENCY, ADMIN, PHONE, Date.now())).rejects.toThrow();
		await withService((tx) =>
			tx.update(deviceKeys).set({ profile_id: CG }).where(eq(deviceKeys.device_id, PHONE))
		);
	});

	it('after revocation the key is never issued again, through the service or tRPC', async () => {
		expect(await revokeDeviceKeys(AGENCY, CG, TABLET)).toBe(1);
		await expect(issueDeviceKey(AGENCY, CG, TABLET, Date.now())).rejects.toBeInstanceOf(
			DeviceRevokedError
		);

		const caller = createCallerFactory(appRouter)({
			user: await getCurrentUser(CG_UID),
			signedInAt: Date.now(),
			request: {}
		});
		await expect(caller.device.key({ deviceId: TABLET })).rejects.toMatchObject({
			code: 'FORBIDDEN'
		});
		// The phone is unaffected
		expect((await caller.device.key({ deviceId: PHONE })).key).toMatch(/^[A-Za-z0-9_-]{43}$/);
	});

	it('an existing key needs a recent sign-in; a session left open on the device is not enough', async () => {
		const stale = Date.now() - REISSUE_WINDOW_MS - 1000;
		await expect(issueDeviceKey(AGENCY, CG, PHONE, stale)).rejects.toBeInstanceOf(SignInAgainError);
		await expect(issueDeviceKey(AGENCY, CG, PHONE, null)).rejects.toBeInstanceOf(SignInAgainError);
		// A device without a key yet gets one: an empty database holds nothing.
		expect(await issueDeviceKey(AGENCY, CG, randomUUID(), stale)).toHaveLength(32);

		const caller = createCallerFactory(appRouter)({
			user: await getCurrentUser(CG_UID),
			signedInAt: stale,
			request: {}
		});
		await expect(caller.device.key({ deviceId: PHONE })).rejects.toMatchObject({
			code: 'UNAUTHORIZED'
		});
	});
});
