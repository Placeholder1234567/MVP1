// What PowerSync actually sends to each user's device, against the local stack
// (Postgres + PowerSync from docker-compose, npm run db:setup). Proves the sync
// streams in offline-sync.md §4 scope data like the RLS policies do.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099'; // dev tokens are emulator-only
process.env.PS_DEV_JWT_KEY ??= 'gi3XNOLkX6khPVxN4PpCoi7zVjDi9lljHRkgCTItfss'; // .env.example
const POWERSYNC = process.env.PUBLIC_POWERSYNC_URL ?? 'http://localhost:8080';

const { closeDb, withService } = await import('../../../src/lib/server/db');
const { agencies, clients, homes, medications, profiles } =
	await import('../../../src/lib/server/db/schema');
const { createSyncCredential } = await import('../../../src/lib/server/identity');

/** Unique row IDs per table that PowerSync streams to this user's device. */
async function syncedRows(authUid: string): Promise<Record<string, string[]>> {
	const cred = await createSyncCredential(authUid);
	if (cred.kind !== 'powersync-token') throw new Error('expected a dev PowerSync token');
	const res = await fetch(`${POWERSYNC}/sync/stream`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', authorization: `Token ${cred.token}` },
		body: JSON.stringify({
			raw_data: true,
			streams: { include_defaults: true, subscriptions: [] }
		}),
		signal: AbortSignal.timeout(10_000)
	});
	if (!res.ok) throw new Error(`PowerSync ${res.status}`);
	const rows = new Map<string, Set<string>>();
	const reader = res.body!.getReader();
	const decoder = new TextDecoder();
	let buf = '';
	for (;;) {
		const { value, done } = await reader.read();
		if (done) throw new Error('stream ended before a complete checkpoint');
		buf += decoder.decode(value, { stream: true });
		let nl;
		while ((nl = buf.indexOf('\n')) >= 0) {
			const line = buf.slice(0, nl).trim();
			buf = buf.slice(nl + 1);
			if (!line) continue;
			const msg = JSON.parse(line);
			for (const op of msg.data?.data ?? []) {
				if (op.op !== 'PUT') continue;
				if (!rows.has(op.object_type)) rows.set(op.object_type, new Set());
				rows.get(op.object_type)!.add(op.object_id);
			}
			if (msg.checkpoint_complete) {
				await reader.cancel();
				return Object.fromEntries([...rows].map(([t, ids]) => [t, [...ids].sort()]));
			}
		}
	}
}

/** Replication is asynchronous: retry until the expectation holds (max ~20 s). */
async function eventually(check: () => Promise<void>) {
	let last: unknown;
	for (let i = 0; i < 40; i++) {
		try {
			return await check();
		} catch (e) {
			last = e;
			await new Promise((r) => setTimeout(r, 500));
		}
	}
	throw last;
}

const A = randomUUID();
const OTHER = randomUUID();
const OAK = randomUUID();
const MAPLE = randomUUID();
const PINE = randomUUID();
const OAK_PERSON = randomUUID();
const MAPLE_PERSON = randomUUID();
const PINE_PERSON = randomUUID();
const OAK_MED = randomUUID();
const CG = `sync-cg-${randomUUID()}`;
const SUP = `sync-sup-${randomUUID()}`;
const OTHER_CG = `sync-other-${randomUUID()}`;

beforeAll(async () => {
	await withService(async (tx) => {
		await tx.insert(agencies).values([
			{ id: A, name: 'Sync Test Agency', subscription_tier: 'complete', slug: `sync-${A}` },
			{
				id: OTHER,
				name: 'Other Sync Agency',
				subscription_tier: 'complete',
				slug: `sync-other-${OTHER}`
			}
		]);
		await tx.insert(homes).values([
			{ id: OAK, agency_id: A, name: 'Oak', lat: 40, lng: -75, radius: 150 },
			{ id: MAPLE, agency_id: A, name: 'Maple', lat: 41, lng: -75, radius: 150 },
			{ id: PINE, agency_id: OTHER, name: 'Pine', lat: 42, lng: -75, radius: 150 }
		]);
		const staff = (
			auth_uid: string,
			agency_id: string,
			role: 'caregiver' | 'supervisor',
			home_ids: string[]
		) => ({
			agency_id,
			auth_uid,
			email: `${auth_uid}@example.test`,
			name: auth_uid,
			role,
			home_ids
		});
		await tx
			.insert(profiles)
			.values([
				staff(CG, A, 'caregiver', [OAK]),
				staff(SUP, A, 'supervisor', []),
				staff(OTHER_CG, OTHER, 'caregiver', [PINE])
			]);
		await tx.insert(clients).values([
			{ id: OAK_PERSON, agency_id: A, home_id: OAK, name: 'Person Oak' },
			{ id: MAPLE_PERSON, agency_id: A, home_id: MAPLE, name: 'Person Maple' },
			{ id: PINE_PERSON, agency_id: OTHER, home_id: PINE, name: 'Person Pine' }
		]);
		await tx.insert(medications).values({
			id: OAK_MED,
			agency_id: A,
			client_id: OAK_PERSON,
			home_id: OAK,
			name: 'Synthetic med'
		});
	});
});

afterAll(closeDb);

describe('sync streams', () => {
	it('a caregiver gets only the people in their own homes', async () => {
		await eventually(async () => {
			const rows = await syncedRows(CG);
			expect(rows.clients).toEqual([OAK_PERSON]);
			expect(rows.agencies).toEqual([A]);
		});
	});

	it('a supervisor gets every home in their agency, even with no assigned homes', async () => {
		await eventually(async () => {
			const rows = await syncedRows(SUP);
			expect(rows.clients).toEqual([OAK_PERSON, MAPLE_PERSON].sort());
			expect(rows.homes).toEqual([OAK, MAPLE].sort());
		});
	});

	it('data for features outside the plan never reaches the device (entitlements.md §8)', async () => {
		const plan = (tier: string, enabled: string[] = []) =>
			withService((tx) =>
				tx
					.update(agencies)
					.set({ subscription_tier: tier, enabled_features: enabled })
					.where(eq(agencies.id, A))
			);
		await eventually(async () => {
			expect((await syncedRows(SUP)).medications).toEqual([OAK_MED]);
		});
		try {
			// Starter has no medication administration: medications leave the device.
			await plan('starter');
			await eventually(async () => {
				const rows = await syncedRows(SUP);
				expect(rows.medications).toBeUndefined();
				expect(rows.clients).toEqual([OAK_PERSON, MAPLE_PERSON].sort());
			});
			// A per-agency override brings just that feature back.
			await plan('starter', ['mar']);
			await eventually(async () => {
				expect((await syncedRows(SUP)).medications).toEqual([OAK_MED]);
			});
		} finally {
			await plan('complete');
		}
	});

	it('nothing crosses agencies', async () => {
		await eventually(async () => {
			const mine = await syncedRows(CG);
			const theirs = await syncedRows(OTHER_CG);
			expect(mine.clients).not.toContain(PINE_PERSON);
			expect(mine.homes).not.toContain(PINE);
			expect(theirs.clients).toEqual([PINE_PERSON]);
			expect(theirs.profiles).toHaveLength(1);
		});
	});

	it('a home reassignment changes what syncs, with no new token', async () => {
		await withService((tx) =>
			tx
				.update(profiles)
				.set({ home_ids: [MAPLE] })
				.where(eq(profiles.auth_uid, CG))
		);
		await eventually(async () => {
			expect((await syncedRows(CG)).clients).toEqual([MAPLE_PERSON]);
		});
	});

	it('a deactivated user gets nothing at all', async () => {
		await withService((tx) =>
			tx.update(profiles).set({ active: false }).where(eq(profiles.auth_uid, CG))
		);
		await eventually(async () => {
			expect(await syncedRows(CG)).toEqual({});
		});
	});

	it('PowerSync rejects tokens it did not issue keys for', async () => {
		const res = await fetch(`${POWERSYNC}/sync/stream`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				authorization: 'Token eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.'
			},
			body: '{}'
		});
		expect(res.status).toBe(401);
	});
});
