// Webhooks (openapi.yaml /webhooks). An agency registers HTTPS URLs for
// events; every minute webhook-sweep turns new audited changes into one
// delivery per subscribed webhook, and webhook-deliver POSTs it signed with
// HMAC-SHA256 (X-Guad-Signature: sha256=<hex>). Deliveries retry after 1, 5,
// 30 and 120 minutes, then fail.
//
// SSRF (openapi.yaml createWebhook): the host is resolved on every send and
// refused if any address is private, loopback, link-local or metadata; the
// request connects to the vetted address (no second lookup to rebind), sends
// no redirects, and gives up after 5 seconds.
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { z } from 'zod';
import {
	checkWebhookUrl,
	isPrivateAddress,
	WEBHOOK_EVENTS,
	WEBHOOK_MAX_ATTEMPTS,
	WEBHOOK_RETRY_MINUTES,
	WEBHOOK_TABLES,
	webhookEventFor,
	type AuditChange
} from '../../../domain/index.ts';
import { withService, type Tx } from '../../db';
import { ServiceError } from '../../errors';
import { enqueue } from '../../jobs/queue.ts';
import { open, seal } from '../../sealing.ts';
import type { ApiCaller } from './keys';
import {
	activeWebhooks,
	AUDIT_PAGE,
	auditChanges,
	countDeliveries,
	countWebhooks,
	deliveryWithWebhook,
	insertDeliveries,
	insertWebhook,
	overdueDeliveries,
	patchWebhook,
	recordAttempt,
	removeWebhook,
	selectDeliveries,
	selectWebhook,
	selectWebhooks,
	webhookSecret
} from './webhooks.queries';

export const WebhookCreateInput = z.object({
	url: z.string().max(2048),
	events: z.array(z.enum(WEBHOOK_EVENTS)).min(1).max(WEBHOOK_EVENTS.length),
	description: z.string().max(256).optional()
});
export const WebhookUpdateInput = WebhookCreateInput.partial().extend({
	active: z.boolean().optional()
});

const iso = <T extends { created_at: Date; updated_at: Date }>(w: T) => ({
	...w,
	created_at: w.created_at.toISOString(),
	updated_at: w.updated_at.toISOString()
});

export function listWebhooks(caller: ApiCaller, limit: number, offset: number) {
	return withService(async (tx) => {
		const rows = await selectWebhooks(tx, caller.agencyId, limit, offset);
		return {
			data: rows.map(iso),
			pagination: { limit, offset, total: await countWebhooks(tx, caller.agencyId) }
		};
	});
}

export async function getWebhook(caller: ApiCaller, id: string) {
	const row = await withService((tx) => selectWebhook(tx, caller.agencyId, id));
	return row ? iso(row) : null;
}

/** Registers a webhook. The signing secret is returned here once. */
export async function createWebhook(caller: ApiCaller, input: unknown) {
	const value = WebhookCreateInput.parse(input);
	const url = checkWebhookUrl(value.url).toString();
	const id = randomUUID();
	const secret = `whsec_${randomBytes(32).toString('base64url')}`;
	const row = await withService((tx) =>
		insertWebhook(tx, {
			id,
			agency_id: caller.agencyId,
			url,
			events: [...new Set(value.events)],
			description: value.description,
			secret_hash: createHash('sha256').update(secret).digest('hex'),
			secret_sealed: seal(Buffer.from(secret), `webhook:${id}`),
			created_by_key_id: caller.keyId
		})
	);
	return { ...iso(row), secret };
}

export async function updateWebhook(caller: ApiCaller, id: string, input: unknown) {
	const value = WebhookUpdateInput.parse(input);
	const set = {
		...(value.url !== undefined ? { url: checkWebhookUrl(value.url).toString() } : {}),
		...(value.events ? { events: [...new Set(value.events)] } : {}),
		...(value.active !== undefined ? { active: value.active } : {}),
		...(value.description !== undefined ? { description: value.description } : {})
	};
	const row = await withService((tx) => patchWebhook(tx, caller.agencyId, id, set));
	return row ? iso(row) : null;
}

export function deleteWebhook(caller: ApiCaller, id: string) {
	return withService((tx) => removeWebhook(tx, caller.agencyId, id));
}

export async function listWebhookDeliveries(
	caller: ApiCaller,
	id: string,
	limit: number,
	offset: number
) {
	return withService(async (tx) => {
		if (!(await selectWebhook(tx, caller.agencyId, id))) return null;
		const rows = await selectDeliveries(tx, caller.agencyId, id, limit, offset);
		const total = Math.min(100, await countDeliveries(tx, caller.agencyId, id));
		return {
			data: rows.map((d) => ({
				id: d.id,
				event: d.event,
				status: d.status,
				status_code: d.status_code,
				attempted_at: (d.attempted_at ?? d.created_at).toISOString(),
				response_time_ms: d.response_time_ms,
				next_retry_at: d.next_retry_at?.toISOString() ?? null
			})),
			pagination: { limit, offset, total }
		};
	});
}

// ─── Sending ────────────────────────────────────────────────────────────────

export interface SendResult {
	statusCode: number | null;
	ms: number;
	error?: string;
}
export type WebhookTransport = (
	url: URL,
	body: string,
	headers: Record<string, string>
) => Promise<SendResult>;

const TIMEOUT_MS = 5000;

/**
 * A `lookup` for https.request that always answers with the vetted address.
 * Node 20+ asks for every address ({ all: true }) when it may try each
 * family in turn, and fails on a single-address answer then.
 */
export function pinnedLookup(target: { address: string; family: number }) {
	return (
		_host: string,
		opts: { all?: boolean } | undefined,
		cb: (e: null, address: string | { address: string; family: number }[], family?: number) => void
	) => (opts?.all ? cb(null, [target]) : cb(null, target.address, target.family));
}

/** Resolves the host, refuses non-public addresses, then posts to the vetted address. */
const httpsTransport: WebhookTransport = async (url, body, headers) => {
	const started = Date.now();
	let addresses: { address: string; family: number }[];
	try {
		addresses = await lookup(url.hostname, { all: true, verbatim: true });
	} catch {
		return { statusCode: null, ms: Date.now() - started, error: 'Host not found' };
	}
	if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address)))
		return { statusCode: null, ms: Date.now() - started, error: 'Address not allowed' };
	const target = addresses[0];
	return new Promise((resolve) => {
		const req = request(
			url,
			{
				method: 'POST',
				headers: { ...headers, 'content-length': Buffer.byteLength(body).toString() },
				timeout: TIMEOUT_MS,
				// Connect to the address we checked, not a fresh lookup.
				lookup: pinnedLookup(target) as never
			},
			(res) => {
				res.resume();
				res.on('end', () =>
					resolve({ statusCode: res.statusCode ?? null, ms: Date.now() - started })
				);
			}
		);
		req.on('timeout', () => req.destroy(new Error('Timed out')));
		req.on('error', (e) =>
			resolve({
				statusCode: null,
				ms: Date.now() - started,
				error: e.message === 'Timed out' ? 'Timed out' : 'Connection failed'
			})
		);
		req.end(body);
	});
};

let transport: WebhookTransport = httpsTransport;
/** Tests replace the network (local receivers are private addresses, which are refused). */
export function setWebhookTransportForTests(t: WebhookTransport | undefined) {
	transport = t ?? httpsTransport;
}

export const signature = (secret: string, body: string) =>
	`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

function send(
	webhookId: string,
	sealed: string | null,
	rawUrl: string,
	event: string,
	deliveryId: string,
	body: string
) {
	if (!sealed)
		return Promise.resolve<SendResult>({ statusCode: null, ms: 0, error: 'No signing secret' });
	const secret = open(sealed, `webhook:${webhookId}`).toString();
	let url: URL;
	try {
		url = checkWebhookUrl(rawUrl);
	} catch {
		return Promise.resolve<SendResult>({ statusCode: null, ms: 0, error: 'URL not allowed' });
	}
	return transport(url, body, {
		'content-type': 'application/json',
		'user-agent': 'Guad-Webhooks/1.0',
		'x-guad-event': event,
		'x-guad-delivery': deliveryId,
		'x-guad-signature': signature(secret, body)
	});
}

/**
 * The agency's webhooks for its admins in the app (apiKey.webhooks), so one
 * registered through the API can be seen and removed without a key.
 */
export async function adminWebhooks(tx: Tx, agencyId: string) {
	return (await selectWebhooks(tx, agencyId, 100, 0)).map(iso);
}

export async function adminDeleteWebhook(tx: Tx, agencyId: string, id: string) {
	if (!(await removeWebhook(tx, agencyId, id)))
		throw new ServiceError('NOT_FOUND', 'Webhook not found');
	return { deleted: true };
}

/** POST /webhooks/{id}/test: a signed test event, not stored as a delivery. */
export async function testWebhook(caller: ApiCaller, id: string) {
	const hook = await withService((tx) => webhookSecret(tx, caller.agencyId, id));
	if (!hook) return null;
	const body = JSON.stringify({
		event: 'webhook.test',
		timestamp: new Date().toISOString(),
		agency_id: caller.agencyId,
		data: { webhook_id: id }
	});
	const result = await send(id, hook.secretSealed, hook.url, 'webhook.test', randomUUID(), body);
	const success = result.statusCode !== null && result.statusCode >= 200 && result.statusCode < 300;
	return {
		success,
		status_code: result.statusCode ?? 0,
		response_time_ms: result.ms,
		...(success ? {} : { error: result.error ?? `Endpoint answered ${result.statusCode}` })
	};
}

/** Pages of audit rows one sweep reads per agency (25 × 2,000), to bound a single run. */
const MAX_SWEEP_PAGES = 25;

/** How far back each sweep looks; a delivery per webhook and audit row is unique, so overlap is safe. */
const SWEEP_WINDOW_MS = 15 * 60_000;

/** webhook-sweep: new audited changes become deliveries for subscribed webhooks. */
export async function sweepWebhooks(
	now = new Date()
): Promise<{ queued: number; requeued: number }> {
	const ids = await withService(async (tx) => {
		const hooks = await activeWebhooks(tx);
		const byAgency = new Map<string, typeof hooks>();
		for (const h of hooks) byAgency.set(h.agencyId, [...(byAgency.get(h.agencyId) ?? []), h]);
		const queued: string[] = [];
		for (const [agencyId, list] of byAgency) {
			const oldest = new Date(Math.min(...list.map((h) => h.createdAt.getTime())));
			const since = new Date(Math.max(oldest.getTime(), now.getTime() - SWEEP_WINDOW_MS));
			// Every page, not just the first: a burst of more than one page of
			// changes in the window would otherwise age out unsent.
			const changes: Awaited<ReturnType<typeof auditChanges>> = [];
			for (let page = 0; page < MAX_SWEEP_PAGES; page++) {
				const next = await auditChanges(tx, agencyId, WEBHOOK_TABLES, since, page);
				changes.push(...next);
				if (next.length < AUDIT_PAGE) break;
			}
			const rows = changes.flatMap((c) => {
				const found = webhookEventFor(c as AuditChange);
				if (!found) return [];
				return list
					.filter((h) => h.events.includes(found.event) && c.created_at > h.createdAt)
					.map((h) => ({
						agency_id: agencyId,
						webhook_id: h.id,
						audit_id: c.id,
						event: found.event,
						status: 'pending',
						next_retry_at: now,
						payload: {
							event: found.event,
							timestamp: c.created_at.toISOString(),
							agency_id: agencyId,
							data: found.data
						}
					}));
			});
			for (const r of await insertDeliveries(tx, rows)) queued.push(r.id);
		}
		return queued;
	});
	for (const id of ids) await enqueue('webhook-deliver', { id }, { taskName: `webhook-${id}-0` });
	// Deliveries whose task never got queued (an enqueue that failed after the
	// commit) or whose retry is overdue: queued again under the same task name,
	// so one that is already waiting isn't sent twice.
	const due = await withService((tx) => overdueDeliveries(tx, new Date(now.getTime() - 60_000)));
	for (const d of due)
		await enqueue('webhook-deliver', { id: d.id }, { taskName: `webhook-${d.id}-${d.attempts}` });
	return { queued: ids.length, requeued: due.length };
}

/** webhook-deliver: one attempt; schedules the next one or marks the delivery failed. */
export async function deliverWebhook(input: { id: string }): Promise<{ status: string }> {
	const outcome = await withService(async (tx) => {
		const d = await deliveryWithWebhook(tx, input.id);
		if (!d || d.status !== 'pending') return { status: d?.status ?? 'gone' };
		if (!d.active) {
			await recordAttempt(tx, d.id, {
				status: 'failed',
				status_code: null,
				response_time_ms: null,
				next_retry_at: null,
				last_error: 'Webhook paused'
			});
			return { status: 'failed' };
		}
		const body = JSON.stringify(d.payload);
		const result = await send(d.webhookId, d.secretSealed, d.url, d.event, d.id, body);
		const ok = result.statusCode !== null && result.statusCode >= 200 && result.statusCode < 300;
		const attempt = d.attempts + 1;
		const retryIn = WEBHOOK_RETRY_MINUTES[attempt - 1];
		const status = ok ? 'delivered' : attempt >= WEBHOOK_MAX_ATTEMPTS ? 'failed' : 'pending';
		await recordAttempt(tx, d.id, {
			status,
			status_code: result.statusCode,
			response_time_ms: result.ms,
			next_retry_at: status === 'pending' ? new Date(Date.now() + retryIn * 60_000) : null,
			last_error: ok ? null : (result.error ?? `HTTP ${result.statusCode}`)
		});
		return { status, attempt, retryIn };
	});
	if (outcome.status === 'pending' && 'retryIn' in outcome)
		await enqueue(
			'webhook-deliver',
			{ id: input.id },
			{ delaySeconds: outcome.retryIn! * 60, taskName: `webhook-${input.id}-${outcome.attempt}` }
		);
	return { status: outcome.status };
}
