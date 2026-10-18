// Audit log access (trpc-router.md audit.*; security.md "Audit Trail").
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';

const { closeDb, withService } = await import('../../../src/lib/server/db');
const s = await import('../../../src/lib/server/db/schema');
const { getCurrentUser } = await import('../../../src/lib/server/services/auth');
const { appRouter } = await import('../../../src/lib/server/trpc/router');
const mw = await import('../../../src/lib/server/trpc/middleware');

const createCaller = mw.createCallerFactory(appRouter);
const AGENCY = randomUUID(),
	PRO = randomUUID(),
	OTHER = randomUUID(),
	HOME = randomUUID();
const [ADMIN, SUP, PRO_ADMIN, OTHER_ADMIN] = Array.from({ length: 4 }, () => randomUUID());
const uid = (id: string) => `audit-${id}`;
const as = async (id: string) =>
	createCaller({ user: await getCurrentUser(uid(id)), request: { ip: '203.0.113.9' } });

beforeAll(async () => {
	await withService(async (t) => {
		await t.insert(s.agencies).values([
			{ id: AGENCY, name: 'Audit Test', slug: `audit-${AGENCY}`, subscription_tier: 'complete' },
			{ id: PRO, name: 'Audit Pro', slug: `audit-${PRO}`, subscription_tier: 'professional' },
			{ id: OTHER, name: 'Audit Other', slug: `audit-${OTHER}`, subscription_tier: 'complete' }
		]);
		await t.insert(s.homes).values({ id: HOME, agency_id: AGENCY, name: 'Oak' });
		await t.insert(s.profiles).values(
			(
				[
					[ADMIN, AGENCY, 'admin'],
					[SUP, AGENCY, 'supervisor'],
					[PRO_ADMIN, PRO, 'admin'],
					[OTHER_ADMIN, OTHER, 'admin']
				] as const
			).map(([id, agency, role]) => ({
				id,
				agency_id: agency,
				auth_uid: uid(id),
				email: `${uid(id)}@example.test`,
				name: 'Synthetic Staff',
				role
			}))
		);
	});
});

afterAll(closeDb);

it('admins list who changed what, without record values, and open one entry at a time', async () => {
	const admin = await as(ADMIN);
	const created = await (
		await as(SUP)
	).client.create({
		name: 'Synthetic Person',
		homeId: HOME,
		healthInfo: { allergies: 'Synthetic allergy' }
	});
	const list = await admin.audit.list({ tableName: 'clients', recordId: created.id });
	expect(list).toEqual([
		expect.objectContaining({
			tableName: 'clients',
			recordId: created.id,
			action: 'INSERT',
			performedBy: SUP,
			performedByName: 'Synthetic Staff'
		})
	]);
	expect(list[0]).not.toHaveProperty('newValues');

	const entry = await admin.audit.get({ id: list[0].id });
	expect(entry.newValues).toMatchObject({ name: 'Synthetic Person' });
	// Opening it is itself recorded.
	const views = await withService((t) =>
		t
			.select()
			.from(s.auditLog)
			.where(and(eq(s.auditLog.table_name, 'audit_views'), eq(s.auditLog.record_id, list[0].id)))
	);
	expect(views).toEqual([
		expect.objectContaining({ performed_by: ADMIN, agency_id: AGENCY, ip_address: '203.0.113.9' })
	]);
});

it('is for admins on a plan with the audit log, in their own agency only', async () => {
	const [any] = await (await as(ADMIN)).audit.list({ limit: 1 });
	await expect((await as(SUP)).audit.list({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
	await expect((await as(PRO_ADMIN)).audit.list({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
	await expect((await as(OTHER_ADMIN)).audit.get({ id: any.id })).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
	expect(
		(await (await as(OTHER_ADMIN)).audit.list({ limit: 200 })).some((e) => e.id === any.id)
	).toBe(false);
});

it('admins download the list as CSV for up to 93 days, without values, and the download is recorded', async () => {
	const admin = await as(ADMIN);
	const created = await (
		await as(SUP)
	).client.create({ name: 'Synthetic Export Person', homeId: HOME });
	const now = Date.now();
	const range = {
		from: new Date(now - 86_400_000).toISOString(),
		to: new Date(now + 60_000).toISOString()
	};
	const file = await admin.audit.export({ dateRange: range, tableName: 'clients' });
	expect(file.contentType).toBe('text/csv');
	expect(file.filename).toMatch(/^audit-log-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv$/);
	const [header, ...lines] = file.content.split('\r\n');
	expect(header).toBe(
		'"Time (UTC)","Action","Record type","Record ID","Done by","Done by ID","Entry ID"'
	);
	expect(lines.some((l) => l.includes(created.id) && l.includes('"INSERT"'))).toBe(true);
	expect(file.content).not.toContain('Synthetic Export Person');
	expect(file.rows).toBe(lines.length);

	const exports = await withService((t) =>
		t
			.select()
			.from(s.auditLog)
			.where(and(eq(s.auditLog.table_name, 'report_exports'), eq(s.auditLog.performed_by, ADMIN)))
	);
	expect(exports).toEqual([
		expect.objectContaining({
			agency_id: AGENCY,
			new_values: { type: 'audit_log', format: 'csv', rows: file.rows }
		})
	]);

	await expect(
		admin.audit.export({
			dateRange: { from: new Date(now - 94 * 86_400_000).toISOString(), to: range.to }
		})
	).rejects.toMatchObject({ code: 'BAD_REQUEST' });
	await expect((await as(SUP)).audit.export({ dateRange: range })).rejects.toMatchObject({
		code: 'FORBIDDEN'
	});
	await expect((await as(PRO_ADMIN)).audit.export({ dateRange: range })).rejects.toMatchObject({
		code: 'FORBIDDEN'
	});
});
