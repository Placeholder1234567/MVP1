// Runs against the local Docker database (npm run db:up && npm run db:setup).
// Proves the app's own transaction helpers switch roles and claims so RLS and
// the integrity triggers apply, on top of the SQL-level tests in .specify/tests/rls.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
const { closeDb, withService, withUser } = await import('../../../src/lib/server/db');
const { agencies, auditLog, clients, homes, profiles } =
	await import('../../../src/lib/server/db/schema');

// Fresh IDs per run so the test never collides with seed data or earlier runs.
const A1 = randomUUID();
const A2 = randomUUID();
const OAK = randomUUID();
const MAPLE = randomUUID();
const PINE = randomUUID();
const CAREGIVER = randomUUID();
const OAK_CLIENT = randomUUID();

const caregiver = { agency_id: A1, role: 'caregiver' as const, profile_id: CAREGIVER };

beforeAll(async () => {
	await withService(async (tx) => {
		await tx.insert(agencies).values([
			{ id: A1, name: 'Test Agency One', subscription_tier: 'complete', slug: `one-${A1}` },
			{ id: A2, name: 'Test Agency Two', subscription_tier: 'complete', slug: `two-${A2}` }
		]);
		await tx.insert(homes).values([
			{ id: OAK, agency_id: A1, name: 'Oak', lat: 40, lng: -75, radius: 150 },
			{ id: MAPLE, agency_id: A1, name: 'Maple', lat: 41, lng: -75, radius: 150 },
			{ id: PINE, agency_id: A2, name: 'Pine', lat: 42, lng: -75, radius: 150 }
		]);
		await tx.insert(profiles).values({
			id: CAREGIVER,
			agency_id: A1,
			auth_uid: `test-${CAREGIVER}`,
			email: `cg-${CAREGIVER}@example.test`,
			name: 'Cara Giver',
			role: 'caregiver',
			home_ids: [OAK]
		});
		await tx.insert(clients).values([
			{ id: OAK_CLIENT, agency_id: A1, home_id: OAK, name: 'Person Oak' },
			{ id: randomUUID(), agency_id: A1, home_id: MAPLE, name: 'Person Maple' },
			{ id: randomUUID(), agency_id: A2, home_id: PINE, name: 'Person Pine' }
		]);
	});
});

afterAll(async () => {
	// Test agencies are left in place: audit_log rows block deleting them by design.
	await closeDb();
});

describe('withUser', () => {
	it('runs as app_user with the claims it was given', async () => {
		const row = await withUser(
			caregiver,
			{},
			async (tx) =>
				(
					await tx.execute(
						sql`SELECT current_setting('role') AS role, public.current_profile_id() AS pid`
					)
				).rows[0]
		);
		expect(row).toEqual({ role: 'app_user', pid: CAREGIVER });
	});

	it('a caregiver sees only clients in their own homes', async () => {
		const rows = await withUser(caregiver, {}, (tx) =>
			tx.select({ id: clients.id }).from(clients).where(eq(clients.agency_id, A1))
		);
		expect(rows.map((r) => r.id)).toEqual([OAK_CLIENT]);
	});

	it('never sees another agency, even when asking for it by id', async () => {
		const rows = await withUser(caregiver, {}, (tx) =>
			tx.select().from(clients).where(eq(clients.agency_id, A2))
		);
		expect(rows).toEqual([]);
	});

	it('claims do not leak into the next transaction on the same pool', async () => {
		await withUser(caregiver, {}, async () => undefined);
		const row = await withService(
			async (tx) =>
				(await tx.execute(sql`SELECT current_setting('app.claims', true) AS claims`)).rows[0]
		);
		expect(row.claims ?? '').toBe('');
	});

	it('the integrity triggers still apply: a caregiver cannot widen their own homes', async () => {
		// Drizzle wraps the Postgres error; the trigger's message is on .cause.
		const err = await withUser(caregiver, {}, (tx) =>
			tx
				.update(profiles)
				.set({ home_ids: [OAK, MAPLE] })
				.where(eq(profiles.id, CAREGIVER))
		).catch((e: Error) => e);
		expect((err as Error & { cause?: Error }).cause?.message).toMatch(
			/Only an admin can change role, homes/
		);
	});

	it('the audit trigger records who made a change and from where', async () => {
		await withUser(caregiver, { ip: '203.0.113.7', user_agent: 'vitest' }, (tx) =>
			tx.update(profiles).set({ name: 'Cara G.' }).where(eq(profiles.id, CAREGIVER))
		);
		const [entry] = await withService((tx) =>
			tx
				.select({ by: auditLog.performed_by, ip: auditLog.ip_address, ua: auditLog.user_agent })
				.from(auditLog)
				.where(
					and(
						eq(auditLog.table_name, 'profiles'),
						eq(auditLog.record_id, CAREGIVER),
						eq(auditLog.action, 'UPDATE')
					)
				)
		);
		expect(entry).toEqual({ by: CAREGIVER, ip: '203.0.113.7', ua: 'vitest' });
	});
});
