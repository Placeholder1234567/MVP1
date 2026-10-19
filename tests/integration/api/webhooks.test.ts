// External API webhooks (openapi.yaml /webhooks): management through the
// real routes, audited changes becoming signed deliveries, retries, and the
// SSRF guard. Synthetic data only.
import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
process.env.DEVICE_KEY_KEK ??= '5JnVufYPg_lWSqzmUZYV7FPssgpajWjvRoSXwToT8o0';

const { closeDb, withService } = await import('../../../src/lib/server/db');
const s = await import('../../../src/lib/server/db/schema');
const { getCurrentUser } = await import('../../../src/lib/server/services/auth');
const { appRouter } = await import('../../../src/lib/server/trpc/router');
const mw = await import('../../../src/lib/server/trpc/middleware');
const integration = await import('../../../src/lib/server/services/integration');
const list = await import('../../../src/routes/api/v1/webhooks/+server');
const one = await import('../../../src/routes/api/v1/webhooks/[webhookId]/+server');
const test = await import('../../../src/routes/api/v1/webhooks/[webhookId]/test/+server');
const deliveries =
	await import('../../../src/routes/api/v1/webhooks/[webhookId]/deliveries/+server');

const createCaller = mw.createCallerFactory(appRouter);
const [AGENCY, OTHER] = [randomUUID(), randomUUID()];
const HOME = randomUUID();
const PERSON = randomUUID();
const ADMIN = randomUUID();
const uid = (id: string) => `webhooks-${id}`;
let writeKey = '';
let readKey = '';

interface Sent {
	url: string;
	body: string;
	headers: Record<string, string>;
}
const sent: Sent[] = [];
let answer = 200;

function call(
	handler: (e: never) => Promise<Response>,
	path: string,
	key: string,
	opts: { method?: string; body?: unknown; params?: Record<string, string> } = {}
) {
	const url = new URL(`http://localhost${path}`);
	const init: RequestInit = {
		method: opts.method ?? 'GET',
		headers: {
			authorization: `Bearer ${key}`,
			...(opts.body ? { 'content-type': 'application/json' } : {})
		},
		...(opts.body ? { body: JSON.stringify(opts.body) } : {})
	};
	const event = {
		request: new Request(url, init),
		url,
		params: opts.params ?? {},
		getClientAddress: () => '203.0.113.9'
	};
	return handler(event as never);
}

const waitFor = async <T>(fn: () => Promise<T | undefined>, ms = 15000): Promise<T> => {
	const end = Date.now() + ms;
	for (;;) {
		const v = await fn();
		if (v) return v;
		if (Date.now() > end) throw new Error('timed out');
		await new Promise((r) => setTimeout(r, 100));
	}
};

beforeAll(async () => {
	integration.setWebhookTransportForTests(async (url, body, headers) => {
		sent.push({ url: url.toString(), body, headers });
		return { statusCode: answer, ms: 3 };
	});
	await withService(async (t) => {
		await t.insert(s.agencies).values([
			{
				id: AGENCY,
				name: 'Webhook Test',
				slug: `wh-${AGENCY}`,
				subscription_tier: 'complete',
				timezone: 'UTC'
			},
			{ id: OTHER, name: 'Webhook Other', slug: `wh-${OTHER}`, subscription_tier: 'complete' }
		]);
		await t.insert(s.homes).values({ id: HOME, agency_id: AGENCY, name: 'Oak House' });
		await t.insert(s.profiles).values({
			id: ADMIN,
			agency_id: AGENCY,
			auth_uid: uid(ADMIN),
			email: `${ADMIN}@example.test`,
			name: 'Synthetic Admin',
			role: 'admin'
		});
		await t
			.insert(s.clients)
			.values({ id: PERSON, agency_id: AGENCY, home_id: HOME, name: 'Ana Synthetic' });
	});
	const admin = createCaller({ user: await getCurrentUser(uid(ADMIN)), request: {} });
	writeKey = (await admin.apiKey.create({ name: 'Writer', scope: 'write' })).key;
	readKey = (await admin.apiKey.create({ name: 'Reader', scope: 'read' })).key;
});

afterAll(async () => {
	integration.setWebhookTransportForTests(undefined);
	await closeDb();
});

let hookId = '';
let secret = '';

describe('managing webhooks', () => {
	it('needs a write key, an https URL and known events', async () => {
		const body = { url: 'https://hooks.example.test/guad', events: ['incident.created'] };
		expect(
			(await call(list.POST, '/api/v1/webhooks', readKey, { method: 'POST', body })).status
		).toBe(403);
		const http = await call(list.POST, '/api/v1/webhooks', writeKey, {
			method: 'POST',
			body: { ...body, url: 'http://hooks.example.test' }
		});
		expect(http.status).toBe(422);
		const unknown = await call(list.POST, '/api/v1/webhooks', writeKey, {
			method: 'POST',
			body: { ...body, events: ['note.deleted'] }
		});
		expect(unknown.status).toBe(400);
	});

	it('shows the secret once and never stores it in plain text', async () => {
		const res = await call(list.POST, '/api/v1/webhooks', writeKey, {
			method: 'POST',
			body: {
				url: 'https://hooks.example.test/guad',
				events: ['incident.created', 'mar.recorded'],
				description: 'Synthetic receiver'
			}
		});
		expect(res.status).toBe(201);
		const created = await res.json();
		expect(created).toMatchObject({ active: true, events: ['incident.created', 'mar.recorded'] });
		expect(created.secret).toMatch(/^whsec_/);
		hookId = created.id;
		secret = created.secret;

		const listed = await (await call(list.GET, '/api/v1/webhooks', readKey)).json();
		expect(listed.pagination.total).toBe(1);
		expect(JSON.stringify(listed)).not.toContain(secret);
		const [row] = await withService((t) =>
			t.select().from(s.webhooks).where(eq(s.webhooks.id, hookId))
		);
		expect(row.secret_sealed).not.toContain(secret);
		expect(row.secret_hash).not.toBe(secret);
	});

	it('updates, and hides other agencies’ webhooks', async () => {
		const res = await call(one.PATCH, `/api/v1/webhooks/${hookId}`, writeKey, {
			method: 'PATCH',
			body: { description: 'Renamed' },
			params: { webhookId: hookId }
		});
		expect((await res.json()).description).toBe('Renamed');
		const ghost = randomUUID();
		expect(
			(await call(one.GET, `/api/v1/webhooks/${ghost}`, readKey, { params: { webhookId: ghost } }))
				.status
		).toBe(404);
	});
});

describe('deliveries', () => {
	it('turns an audited change into one signed delivery without PHI', async () => {
		const incident = randomUUID();
		await withService((t) =>
			t.insert(s.incidents).values({
				id: incident,
				agency_id: AGENCY,
				client_id: PERSON,
				home_id: HOME,
				type: 'Fall',
				severity: 'Low',
				occurred_at: new Date(),
				description: 'Synthetic description that must not leave'
			})
		);
		expect((await integration.sweepWebhooks()).queued).toBe(1);
		// A second sweep over the same window adds nothing.
		expect((await integration.sweepWebhooks()).queued).toBe(0);

		const delivery = await waitFor(() =>
			Promise.resolve(sent.find((x) => x.body.includes(incident)))
		);
		const payload = JSON.parse(delivery.body);
		expect(payload).toMatchObject({
			event: 'incident.created',
			agency_id: AGENCY,
			data: { id: incident, client_id: PERSON, home_id: HOME, severity: 'Low', status: 'open' }
		});
		expect(delivery.body).not.toContain('Synthetic description');
		expect(delivery.headers['x-guad-signature']).toBe(
			`sha256=${createHmac('sha256', secret).update(delivery.body).digest('hex')}`
		);

		const log = await waitFor(async () => {
			const r = await (
				await call(deliveries.GET, `/api/v1/webhooks/${hookId}/deliveries`, readKey, {
					params: { webhookId: hookId }
				})
			).json();
			return r.data[0]?.status === 'delivered' ? r : undefined;
		});
		expect(log.data[0]).toMatchObject({ event: 'incident.created', status_code: 200 });
	});

	it('retries a failed delivery later, then gives up after the last attempt', async () => {
		answer = 500;
		await withService(async (t) => {
			const [med] = await t
				.insert(s.medications)
				.values({ agency_id: AGENCY, client_id: PERSON, home_id: HOME, name: 'Synthetic' })
				.returning({ id: s.medications.id });
			await t.insert(s.marRecords).values({
				agency_id: AGENCY,
				client_id: PERSON,
				home_id: HOME,
				medication_id: med.id,
				day: '2026-03-01',
				status: 'given',
				is_prn: true
			});
		});
		await integration.sweepWebhooks();
		const row = await waitFor(async () => {
			const [d] = await withService((t) =>
				t.select().from(s.webhookDeliveries).where(eq(s.webhookDeliveries.event, 'mar.recorded'))
			);
			return d && d.attempts === 1 ? d : undefined;
		});
		expect(row).toMatchObject({ status: 'pending', status_code: 500, last_error: 'HTTP 500' });
		expect(row.next_retry_at!.getTime()).toBeGreaterThan(Date.now());

		// Run the remaining attempts now instead of waiting for the delays.
		for (let i = 0; i < 4; i++) await integration.deliverWebhook({ id: row.id });
		const [done] = await withService((t) =>
			t.select().from(s.webhookDeliveries).where(eq(s.webhookDeliveries.id, row.id))
		);
		expect(done).toMatchObject({ status: 'failed', attempts: 5 });
		answer = 200;
	});

	it('tests the endpoint, refusing private addresses for real', async () => {
		const ok = await (
			await call(test.POST, `/api/v1/webhooks/${hookId}/test`, writeKey, {
				method: 'POST',
				params: { webhookId: hookId }
			})
		).json();
		expect(ok).toMatchObject({ success: true, status_code: 200 });

		integration.setWebhookTransportForTests(undefined);
		await call(one.PATCH, `/api/v1/webhooks/${hookId}`, writeKey, {
			method: 'PATCH',
			body: { url: 'https://127.0.0.1/hook' },
			params: { webhookId: hookId }
		});
		const blocked = await (
			await call(test.POST, `/api/v1/webhooks/${hookId}/test`, writeKey, {
				method: 'POST',
				params: { webhookId: hookId }
			})
		).json();
		expect(blocked).toMatchObject({ success: false, status_code: 0, error: 'Address not allowed' });
	});

	it('deletes', async () => {
		expect(
			(
				await call(one.DELETE, `/api/v1/webhooks/${hookId}`, writeKey, {
					method: 'DELETE',
					params: { webhookId: hookId }
				})
			).status
		).toBe(204);
		expect((await (await call(list.GET, '/api/v1/webhooks', readKey)).json()).data).toEqual([]);
	});
});

describe('keys, recovery and the admin screen', () => {
	const stub = () =>
		integration.setWebhookTransportForTests(async (url, body, headers) => {
			sent.push({ url: url.toString(), body, headers });
			return { statusCode: 200, ms: 3 };
		});
	const register = async (key: string) =>
		(
			await (
				await call(list.POST, '/api/v1/webhooks', key, {
					method: 'POST',
					body: { url: 'https://hooks.example.test/guad', events: ['incident.created'] }
				})
			).json()
		).id as string;
	const deliveriesFor = (id: string) =>
		withService((t) =>
			t.select().from(s.webhookDeliveries).where(eq(s.webhookDeliveries.webhook_id, id))
		);

	it('revoking a key stops the webhooks it registered', async () => {
		stub();
		const admin = createCaller({ user: await getCurrentUser(uid(ADMIN)), request: {} });
		const created = await admin.apiKey.create({ name: 'Leaked', scope: 'write' });
		const hook = await register(created.key);
		expect((await admin.apiKey.webhooks()).map((h) => h.id)).toContain(hook);
		await admin.apiKey.revoke({ id: created.id });
		expect((await admin.apiKey.webhooks()).find((h) => h.id === hook)?.active).toBe(false);
		await withService((t) =>
			t.insert(s.incidents).values({
				agency_id: AGENCY,
				client_id: PERSON,
				home_id: HOME,
				type: 'Fall',
				severity: 'Low',
				occurred_at: new Date(),
				description: 'Synthetic'
			})
		);
		await integration.sweepWebhooks();
		expect(await deliveriesFor(hook)).toEqual([]);
		// Admins can remove it in the app, without a key.
		await admin.apiKey.deleteWebhook({ id: hook });
		expect((await admin.apiKey.webhooks()).map((h) => h.id)).not.toContain(hook);
	});

	it('the sweep re-queues a delivery whose task was lost', async () => {
		stub();
		const hook = await register(writeKey);
		const id = randomUUID();
		await withService((t) =>
			t.insert(s.webhookDeliveries).values({
				id,
				agency_id: AGENCY,
				webhook_id: hook,
				event: 'incident.created',
				audit_id: randomUUID(),
				payload: { event: 'incident.created' },
				attempts: 1,
				status: 'pending',
				next_retry_at: new Date(Date.now() - 10 * 60_000)
			})
		);
		await integration.sweepWebhooks();
		const [done] = await waitFor(async () => {
			const rows = await deliveriesFor(hook);
			return rows.find((r) => r.id === id && r.status === 'delivered') ? rows : undefined;
		});
		expect(done).toMatchObject({ status: 'delivered', attempts: 2 });
	});

	it('the pinned lookup answers both single and all-address requests', () => {
		const lookup = integration.pinnedLookupForTests({ address: '93.184.216.34', family: 4 });
		const got: unknown[] = [];
		lookup('h', { all: true }, (_e, a) => got.push(a));
		lookup('h', undefined, (_e, a, f) => got.push([a, f]));
		expect(got).toEqual([[{ address: '93.184.216.34', family: 4 }], ['93.184.216.34', 4]]);
	});
});
