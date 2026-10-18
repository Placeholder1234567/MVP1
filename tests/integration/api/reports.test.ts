// External API reports (openapi.yaml /reports): queued, built in the
// background into private storage, polled, downloaded, and expired.
// Synthetic data only; storage is in memory.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';

const { closeDb, withService } = await import('../../../src/lib/server/db');
const s = await import('../../../src/lib/server/db/schema');
const { getCurrentUser } = await import('../../../src/lib/server/services/auth');
const { appRouter } = await import('../../../src/lib/server/trpc/router');
const mw = await import('../../../src/lib/server/trpc/middleware');
const { setStorageForTests } = await import('../../../src/lib/server/storage');
const integration = await import('../../../src/lib/server/services/integration');
const create = await import('../../../src/routes/api/v1/reports/[type]/+server');
const status = await import('../../../src/routes/api/v1/reports/[type]/[reportId]/+server');
const download =
	await import('../../../src/routes/api/v1/reports/[type]/[reportId]/download/+server');

const createCaller = mw.createCallerFactory(appRouter);
const [AGENCY, OTHER, STARTER] = [randomUUID(), randomUUID(), randomUUID()];
const [HOME, OTHER_HOME] = [randomUUID(), randomUUID()];
const [PERSON, OTHER_PERSON] = [randomUUID(), randomUUID()];
const [ADMIN, STARTER_ADMIN] = [randomUUID(), randomUUID()];
const [IN_RANGE, OUT_OF_RANGE, FOREIGN] = [randomUUID(), randomUUID(), randomUUID()];
const uid = (id: string) => `reports-${id}`;
const files = new Map<string, Buffer>();
let writeKey = '';
let readKey = '';
let starterKey = '';

function call(
	handler: (e: never) => Promise<Response>,
	path: string,
	key: string,
	params: Record<string, string>,
	body?: unknown
) {
	const url = new URL(`http://localhost${path}`);
	const event = {
		request: new Request(url, {
			method: body ? 'POST' : 'GET',
			headers: {
				authorization: `Bearer ${key}`,
				...(body ? { 'content-type': 'application/json' } : {})
			},
			...(body ? { body: JSON.stringify(body) } : {})
		}),
		url,
		params,
		getClientAddress: () => '203.0.113.11'
	};
	return handler(event as never);
}

const ready = async (id: string) => {
	for (let i = 0; i < 150; i++) {
		const r = await (
			await call(status.GET, `/api/v1/reports/incidents/${id}`, readKey, {
				type: 'incidents',
				reportId: id
			})
		).json();
		if (r.status !== 'queued' && r.status !== 'processing') return r;
		await new Promise((done) => setTimeout(done, 100));
	}
	throw new Error('report never finished');
};

beforeAll(async () => {
	setStorageForTests({
		put: async (p, b) => void files.set(p, b),
		get: async (p) => files.get(p) ?? null,
		remove: async (p) => void files.delete(p)
	});
	await withService(async (t) => {
		await t.insert(s.agencies).values([
			{
				id: AGENCY,
				name: 'Report Test',
				slug: `rp-${AGENCY}`,
				subscription_tier: 'complete',
				timezone: 'UTC'
			},
			{ id: OTHER, name: 'Report Other', slug: `rp-${OTHER}`, subscription_tier: 'complete' },
			{ id: STARTER, name: 'Report Starter', slug: `rp-${STARTER}`, subscription_tier: 'starter' }
		]);
		await t.insert(s.homes).values([
			{ id: HOME, agency_id: AGENCY, name: 'Oak House' },
			{ id: OTHER_HOME, agency_id: OTHER, name: 'Far House' }
		]);
		await t.insert(s.profiles).values(
			[
				[ADMIN, AGENCY],
				[STARTER_ADMIN, STARTER]
			].map(([id, agency]) => ({
				id,
				agency_id: agency,
				auth_uid: uid(id),
				email: `${id}@example.test`,
				name: 'Synthetic Admin',
				role: 'admin' as const
			}))
		);
		await t.insert(s.clients).values([
			{ id: PERSON, agency_id: AGENCY, home_id: HOME, name: 'Ana Synthetic' },
			{ id: OTHER_PERSON, agency_id: OTHER, home_id: OTHER_HOME, name: 'Far Synthetic' }
		]);
		const incident = (id: string, agency: string, home: string, person: string, at: string) => ({
			id,
			agency_id: agency,
			client_id: person,
			home_id: home,
			type: 'Fall',
			severity: 'Low' as const,
			occurred_at: new Date(at),
			description: 'Synthetic'
		});
		await t
			.insert(s.incidents)
			.values([
				incident(IN_RANGE, AGENCY, HOME, PERSON, '2026-03-02T10:00:00Z'),
				incident(OUT_OF_RANGE, AGENCY, HOME, PERSON, '2026-04-02T10:00:00Z'),
				incident(FOREIGN, OTHER, OTHER_HOME, OTHER_PERSON, '2026-03-02T10:00:00Z')
			]);
	});
	const admin = createCaller({ user: await getCurrentUser(uid(ADMIN)), request: {} });
	writeKey = (await admin.apiKey.create({ name: 'Writer', scope: 'write' })).key;
	readKey = (await admin.apiKey.create({ name: 'Reader' })).key;
	const starter = createCaller({ user: await getCurrentUser(uid(STARTER_ADMIN)), request: {} });
	starterKey = (await starter.apiKey.create({ name: 'Starter', scope: 'write' })).key;
});

afterAll(async () => {
	setStorageForTests(undefined);
	await closeDb();
});

let reportId = '';

it('queues a report and builds a CSV of the agency’s records in the period', async () => {
	const res = await call(
		create.POST,
		'/api/v1/reports/incidents',
		writeKey,
		{ type: 'incidents' },
		{
			from: '2026-03-01',
			to: '2026-03-31'
		}
	);
	expect(res.status).toBe(202);
	const queued = await res.json();
	expect(queued).toMatchObject({ status: 'queued' });
	reportId = queued.report_id;

	const done = await ready(reportId);
	expect(done).toMatchObject({ status: 'ready', type: 'incidents', format: 'csv' });
	expect(new Date(done.expires_at).getTime() - new Date(done.ready_at).getTime()).toBe(
		24 * 3600_000
	);

	const file = await call(download.GET, `/api/v1/reports/incidents/${reportId}/download`, readKey, {
		type: 'incidents',
		reportId
	});
	expect(file.status).toBe(200);
	expect(file.headers.get('content-disposition')).toMatch(
		/^attachment; filename="report-incidents-\d{4}-\d{2}-\d{2}\.csv"$/
	);
	const csv = await file.text();
	expect(csv.split('\r\n')[0]).toContain('"id","client_id","home_id","type","severity"');
	expect(csv).toContain(IN_RANGE);
	expect(csv).not.toContain(OUT_OF_RANGE);
	expect(csv).not.toContain(FOREIGN);
});

it('checks scope, plan, format and input', async () => {
	const body = { from: '2026-03-01', to: '2026-03-31' };
	expect(
		(await call(create.POST, '/api/v1/reports/incidents', readKey, { type: 'incidents' }, body))
			.status
	).toBe(403);
	expect(
		(await call(create.POST, '/api/v1/reports/audit', starterKey, { type: 'audit' }, body)).status
	).toBe(403);
	expect(
		(
			await call(
				create.POST,
				'/api/v1/reports/timesheets',
				starterKey,
				{ type: 'timesheets' },
				body
			)
		).status
	).toBe(202);
	const pdf = await call(
		create.POST,
		'/api/v1/reports/incidents',
		writeKey,
		{ type: 'incidents' },
		{ ...body, format: 'pdf' }
	);
	expect(pdf.status).toBe(400);
	expect((await pdf.json()).message).toContain('PDF');
	expect(
		(
			await call(
				create.POST,
				'/api/v1/reports/timesheets',
				writeKey,
				{ type: 'timesheets' },
				{ ...body, client_id: PERSON }
			)
		).status
	).toBe(400);
	expect(
		(await call(create.POST, '/api/v1/reports/payroll', writeKey, { type: 'payroll' }, body)).status
	).toBe(404);
});

it('refuses downloads after expiry, and cleanup removes the file', async () => {
	await withService((t) =>
		t
			.update(s.reportJobs)
			.set({ expires_at: new Date(Date.now() - 1000) })
			.where(eq(s.reportJobs.id, reportId))
	);
	const res = await call(download.GET, `/api/v1/reports/incidents/${reportId}/download`, readKey, {
		type: 'incidents',
		reportId
	});
	expect(res.status).toBe(409);
	const path = `reports/${AGENCY}/${reportId}.csv`;
	expect(files.has(path)).toBe(true);
	await integration.cleanupReports();
	expect(files.has(path)).toBe(false);
	// Another agency's key can't see the report at all.
	expect(
		(
			await call(status.GET, `/api/v1/reports/incidents/${reportId}`, starterKey, {
				type: 'incidents',
				reportId
			})
		).status
	).toBe(404);
});
