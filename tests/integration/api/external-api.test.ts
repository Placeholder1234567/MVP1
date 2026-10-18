// External API (openapi.yaml): API keys, EVV and bulk export, called through
// the real route handlers with synthetic data in two agencies.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';

const { closeDb, withService } = await import('../../../src/lib/server/db');
const s = await import('../../../src/lib/server/db/schema');
const { getCurrentUser } = await import('../../../src/lib/server/services/auth');
const { appRouter } = await import('../../../src/lib/server/trpc/router');
const mw = await import('../../../src/lib/server/trpc/middleware');
const visits = await import('../../../src/routes/api/v1/evv/visits/+server');
const visit = await import('../../../src/routes/api/v1/evv/visits/[visitId]/+server');
const summary = await import('../../../src/routes/api/v1/evv/summary/+server');
const exporter = await import('../../../src/routes/api/v1/export/[type]/+server');

const createCaller = mw.createCallerFactory(appRouter);
const [AGENCY, OTHER, STARTER] = [randomUUID(), randomUUID(), randomUUID()];
const [OAK, ELM, FAR] = [randomUUID(), randomUUID(), randomUUID()];
const [ADMIN, CARER, OTHER_CARER, STARTER_ADMIN] = [
	randomUUID(),
	randomUUID(),
	randomUUID(),
	randomUUID()
];
const PERSON = randomUUID();
const [V1, V2, V3, FOREIGN] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const uid = (id: string) => `extapi-${id}`;
const as = async (id: string) => createCaller({ user: await getCurrentUser(uid(id)), request: {} });

type Handler = (event: never) => Promise<Response>;
function call(
	handler: Handler,
	path: string,
	key: string | null,
	params: Record<string, string> = {}
): Promise<Response> {
	const url = new URL(`http://localhost${path}`);
	const headers = new Headers(key ? { authorization: `Bearer ${key}` } : {});
	const event = {
		request: new Request(url, { headers }),
		url,
		params,
		getClientAddress: () => '203.0.113.7'
	};
	return handler(event as never);
}

let key = '';
let starterKey = '';

beforeAll(async () => {
	await withService(async (t) => {
		await t.insert(s.agencies).values([
			{
				id: AGENCY,
				name: 'API Test',
				slug: `api-${AGENCY}`,
				subscription_tier: 'complete',
				timezone: 'UTC'
			},
			{ id: OTHER, name: 'API Other', slug: `api-${OTHER}`, subscription_tier: 'complete' },
			{ id: STARTER, name: 'API Starter', slug: `api-${STARTER}`, subscription_tier: 'starter' }
		]);
		await t.insert(s.homes).values([
			{
				id: OAK,
				agency_id: AGENCY,
				name: 'Oak House',
				address: '1 Synthetic Way',
				lat: 40,
				lng: -75,
				radius: 150
			},
			{ id: ELM, agency_id: AGENCY, name: 'Elm House', lat: 41, lng: -75, radius: 150 },
			{ id: FAR, agency_id: OTHER, name: 'Far House', lat: 42, lng: -75, radius: 150 }
		]);
		await t.insert(s.profiles).values(
			(
				[
					[ADMIN, AGENCY, 'admin', []],
					[CARER, AGENCY, 'caregiver', [OAK]],
					[OTHER_CARER, OTHER, 'caregiver', [FAR]],
					[STARTER_ADMIN, STARTER, 'admin', []]
				] as const
			).map(([id, agency, role, homes]) => ({
				id,
				agency_id: agency,
				auth_uid: uid(id),
				email: `${id}@example.test`,
				name: role === 'caregiver' ? 'Casey Synthetic' : 'Synthetic Admin',
				role,
				home_ids: [...homes]
			}))
		);
		await t.insert(s.clients).values({
			id: PERSON,
			agency_id: AGENCY,
			home_id: OAK,
			name: 'Ana Synthetic',
			first_name: 'Ana'
		});
		await t.insert(s.clientHealthInfo).values({
			agency_id: AGENCY,
			client_id: PERSON,
			home_id: OAK,
			allergies: 'Synthetic allergy',
			dob: '1990-01-01'
		});
		await t.insert(s.clockRecords).values([
			{
				id: V1,
				agency_id: AGENCY,
				profile_id: CARER,
				home_id: OAK,
				clock_in_at: new Date('2026-03-02T07:00:00Z'),
				clock_out_at: new Date('2026-03-02T15:00:00Z'),
				clock_in_lat: 40.0001,
				clock_in_lng: -75,
				verified: true
			},
			{
				id: V2,
				agency_id: AGENCY,
				profile_id: CARER,
				home_id: ELM,
				clock_in_at: new Date('2026-03-03T07:00:00Z'),
				verified: false
			},
			{
				id: V3,
				agency_id: AGENCY,
				profile_id: CARER,
				home_id: OAK,
				clock_in_at: new Date('2026-04-01T07:00:00Z'),
				clock_in_lat: 40,
				clock_in_lng: -75,
				verified: true
			},
			{
				id: FOREIGN,
				agency_id: OTHER,
				profile_id: OTHER_CARER,
				home_id: FAR,
				clock_in_at: new Date('2026-03-02T07:00:00Z'),
				verified: true
			}
		]);
	});
	key = (await (await as(ADMIN)).apiKey.create({ name: 'Synthetic EVV', scope: 'read' })).key;
	starterKey = (await (await as(STARTER_ADMIN)).apiKey.create({ name: 'Starter' })).key;
});

afterAll(() => closeDb());

describe('API keys', () => {
	it('are admin-only, shown once and listed without the secret', async () => {
		expect(key).toMatch(/^guad_[A-Za-z0-9_-]{43}$/);
		const list = await (await as(ADMIN)).apiKey.list();
		expect(list).toHaveLength(1);
		expect(list[0]).toMatchObject({
			name: 'Synthetic EVV',
			prefix: key.slice(0, 12),
			scope: 'read'
		});
		expect(JSON.stringify(list)).not.toContain(key);
		await expect((await as(CARER)).apiKey.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
	});

	it('reject missing, wrong and revoked keys', async () => {
		expect(
			(await call(visits.GET, '/api/v1/evv/visits?from=2026-03-01&to=2026-03-31', null)).status
		).toBe(401);
		const wrong = await call(
			visits.GET,
			'/api/v1/evv/visits?from=2026-03-01&to=2026-03-31',
			`guad_${'x'.repeat(43)}`
		);
		expect(wrong.status).toBe(401);
		expect(await wrong.json()).toEqual({
			error: 'UNAUTHORIZED',
			message: 'Invalid or expired API key'
		});

		const admin = await as(ADMIN);
		const temp = await admin.apiKey.create({ name: 'Temporary' });
		expect(
			(await call(summary.GET, '/api/v1/evv/summary?from=2026-03-01&to=2026-03-31', temp.key))
				.status
		).toBe(200);
		await admin.apiKey.revoke({ id: temp.id });
		expect(
			(await call(summary.GET, '/api/v1/evv/summary?from=2026-03-01&to=2026-03-31', temp.key))
				.status
		).toBe(401);
	});
});

describe('EVV', () => {
	it('lists the agency’s visits in the range, with paging and filters', async () => {
		const res = await call(visits.GET, '/api/v1/evv/visits?from=2026-03-01&to=2026-03-31', key);
		expect(res.status).toBe(200);
		expect(res.headers.get('x-ratelimit-limit')).toBe('30');
		const body = await res.json();
		expect(body.pagination).toEqual({ limit: 100, offset: 0, total: 2 });
		expect(body.data.map((v: { id: string }) => v.id)).toEqual([V1, V2]);
		expect(body.data[0]).toMatchObject({
			profile_name: 'Casey Synthetic',
			home_name: 'Oak House',
			home_address: '1 Synthetic Way',
			clock_in_at: '2026-03-02T07:00:00.000Z',
			verified: true,
			distance_meters: 11,
			home_radius: 150,
			duration_minutes: 480
		});
		expect(body.data[1]).toMatchObject({ clock_out_at: null, duration_minutes: null });

		const verified = await (
			await call(
				visits.GET,
				`/api/v1/evv/visits?from=2026-03-01&to=2026-04-30&verified_only=true&home_id=${OAK}&limit=1&offset=1`,
				key
			)
		).json();
		expect(verified.pagination).toEqual({ limit: 1, offset: 1, total: 2 });
		expect(verified.data.map((v: { id: string }) => v.id)).toEqual([V3]);
	});

	it('gets one visit, never another agency’s', async () => {
		expect(
			(await (await call(visit.GET, `/api/v1/evv/visits/${V1}`, key, { visitId: V1 })).json()).id
		).toBe(V1);
		expect(
			(await call(visit.GET, `/api/v1/evv/visits/${FOREIGN}`, key, { visitId: FOREIGN })).status
		).toBe(404);
		expect(
			(await call(visit.GET, '/api/v1/evv/visits/nope', key, { visitId: 'nope' })).status
		).toBe(404);
	});

	it('summarizes verification', async () => {
		const body = await (
			await call(summary.GET, '/api/v1/evv/summary?from=2026-03-01&to=2026-03-31', key)
		).json();
		expect(body).toEqual({
			total_visits: 2,
			verified_count: 1,
			unverified_count: 1,
			verification_rate: 0.5,
			period: { from: '2026-03-01', to: '2026-03-31' }
		});
	});

	it('rejects bad ranges with the spec’s error shape', async () => {
		const res = await call(summary.GET, '/api/v1/evv/summary?from=2026-03-31&to=2026-03-01', key);
		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({
			error: 'BAD_REQUEST',
			message: "'from' date must be before 'to' date"
		});
		expect((await call(visits.GET, '/api/v1/evv/visits?from=2026-03-01', key)).status).toBe(400);
	});
});

describe('export', () => {
	it('exports CSV by default and health details only on request', async () => {
		const csv = await call(exporter.GET, '/api/v1/export/clients', key, { type: 'clients' });
		expect(csv.status).toBe(200);
		expect(csv.headers.get('content-type')).toContain('text/csv');
		expect(csv.headers.get('x-ratelimit-limit')).toBe('60');
		const text = await csv.text();
		expect(text.split('\r\n')[0]).toBe(
			'"id","name","first_name","active","home_id","created_at","updated_at"'
		);
		expect(text).not.toContain('Synthetic allergy');

		const json = await (
			await call(exporter.GET, '/api/v1/export/clients?format=json&include_health=true', key, {
				type: 'clients'
			})
		).json();
		expect(json.data).toEqual([
			expect.objectContaining({
				id: PERSON,
				first_name: 'Ana',
				allergies: 'Synthetic allergy',
				dob: '1990-01-01'
			})
		]);
		expect(json.pagination.total).toBe(1);
		expect(json.exported_at).toEqual(expect.any(String));
	});

	it('filters staff by home and never exports sign-in IDs', async () => {
		const json = await (
			await call(exporter.GET, `/api/v1/export/staff?format=json&home_id=${OAK}`, key, {
				type: 'staff'
			})
		).json();
		expect(json.data.map((p: { id: string }) => p.id)).toEqual([CARER]);
		expect(json.data[0]).not.toHaveProperty('auth_uid');
	});

	it('follows the plan and rejects unknown types', async () => {
		const notes = await call(exporter.GET, '/api/v1/export/notes', starterKey, { type: 'notes' });
		expect(notes.status).toBe(403);
		expect(
			(
				await call(exporter.GET, '/api/v1/export/clock_records', starterKey, {
					type: 'clock_records'
				})
			).status
		).toBe(200);
		expect(
			(await call(exporter.GET, '/api/v1/export/secrets', key, { type: 'secrets' })).status
		).toBe(400);
	});
});

it('audits every call by key and operation', async () => {
	const rows = await withService((t) =>
		t
			.select({ values: s.auditLog.new_values, ip: s.auditLog.ip_address })
			.from(s.auditLog)
			.where(and(eq(s.auditLog.agency_id, AGENCY), eq(s.auditLog.table_name, 'api_access')))
	);
	const ops = rows.map((r) => (r.values as { operation: string; status: number }).operation);
	expect(ops).toEqual(
		expect.arrayContaining(['listEvvVisits', 'getEvvVisit', 'getEvvSummary', 'exportData'])
	);
	expect(rows.find((r) => (r.values as { status: number }).status === 400)).toBeTruthy();
	expect(rows[0].ip).toBe('203.0.113.7');
});

it('limits each key to 30 requests a minute', async () => {
	const burst = (await (await as(ADMIN)).apiKey.create({ name: 'Burst' })).key;
	// Tokens refill at one per 2 seconds, so a slow machine may get a few extra calls in.
	let last: Response | undefined;
	let calls = 0;
	do {
		last = await call(summary.GET, '/api/v1/evv/summary?from=2026-03-01&to=2026-03-02', burst);
		calls++;
	} while (last.status === 200 && calls < 60);
	expect(last.status).toBe(429);
	expect(calls).toBeGreaterThan(30);
	expect(Number(last.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
	expect(last.headers.get('x-ratelimit-remaining')).toBe('0');
	expect(await last.json()).toMatchObject({ error: 'RATE_LIMITED' });
});
