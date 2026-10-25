// A person's record for a right-of-access request (report.exportPersonRecord;
// HIPAA 164.524): admins, one person, on every plan, even after a downgrade.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';

const { closeDb, withService, withUser } = await import('../../../src/lib/server/db');
const { exportClinical } = await import('../../../src/lib/server/services/report/index.ts');
const s = await import('../../../src/lib/server/db/schema');
const { getCurrentUser } = await import('../../../src/lib/server/services/auth');
const { appRouter } = await import('../../../src/lib/server/trpc/router');
const mw = await import('../../../src/lib/server/trpc/middleware');

const createCaller = mw.createCallerFactory(appRouter);
const [agency, home, newHome, person, admin, supervisor] = Array.from({ length: 6 }, () =>
	randomUUID()
);
const uid = (id: string) => `person-record-${id}`;
const as = async (id: string) => createCaller({ user: await getCurrentUser(uid(id)), request: {} });
const input = {
	type: 'incidents' as const,
	clientId: person,
	fromDay: '2026-03-01',
	toDay: '2026-03-31',
	format: 'csv' as const
};

beforeAll(async () => {
	await withService(async (t) => {
		// Downgraded to Starter: care records stay, care reports are off the plan.
		await t.insert(s.agencies).values({
			id: agency,
			name: 'Synthetic',
			slug: `person-record-${agency}`,
			subscription_tier: 'starter',
			timezone: 'UTC'
		});
		await t.insert(s.homes).values([
			{ id: home, agency_id: agency, name: 'Synthetic home' },
			{ id: newHome, agency_id: agency, name: 'Synthetic new home' }
		]);
		await t.insert(s.profiles).values(
			(
				[
					[admin, 'admin'],
					[supervisor, 'supervisor']
				] as const
			).map(([id, role]) => ({
				id,
				agency_id: agency,
				auth_uid: uid(id),
				email: `${id}@example.test`,
				name: 'Synthetic staff',
				role,
				home_ids: [home]
			}))
		);
		await t
			.insert(s.clients)
			.values({ id: person, agency_id: agency, home_id: home, name: 'Synthetic Person' });
		await t.insert(s.incidents).values({
			agency_id: agency,
			client_id: person,
			home_id: home,
			type: 'Fall',
			description: 'Synthetic fall before the downgrade.',
			occurred_at: new Date('2026-03-10T12:00:00Z')
		});
		// Since then they moved home (incidents stay with the old home) and left.
		await t
			.update(s.clients)
			.set({ home_id: newHome, active: false })
			.where(eq(s.clients.id, person));
	});
});

afterAll(closeDb);

it('lets an admin download one person’s record from every home, after a downgrade and after they left', async () => {
	const adminCaller = await as(admin);
	await expect(adminCaller.report.exportClinical({ ...input, homeId: home })).rejects.toThrow();
	const file = await adminCaller.report.exportPersonRecord(input);
	expect(file.rows).toBe(1);
	expect(file.content).toContain('Synthetic fall before the downgrade.');
	const [audit] = await withService((t) =>
		t
			.select()
			.from(s.auditLog)
			.where(and(eq(s.auditLog.agency_id, agency), eq(s.auditLog.table_name, 'report_exports')))
	);
	expect(audit.new_values).toMatchObject({ rightOfAccess: true, clientId: person, rows: 1 });
});

it('is for admins and one person only', async () => {
	await expect((await as(supervisor)).report.exportPersonRecord(input)).rejects.toThrow();
	await expect(
		(await as(admin)).report.exportPersonRecord({
			...input,
			clientId: undefined as unknown as string
		})
	).rejects.toThrow();
	// The service checks the role itself, whatever the caller.
	const user = await getCurrentUser(uid(supervisor));
	await expect(
		withUser(user!.claims, {}, (tx) =>
			exportClinical(tx, user!, input, {}, { rightOfAccess: true })
		)
	).rejects.toThrow('for admins');
});
