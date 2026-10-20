import { and, asc, count, desc, eq, gt, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { Tx } from '../../db';
import { apiKeys, auditLog, webhookDeliveries, webhooks } from '../../db/schema';

export const webhookView = {
	id: webhooks.id,
	url: webhooks.url,
	events: webhooks.events,
	active: webhooks.active,
	description: webhooks.description,
	created_at: webhooks.created_at,
	updated_at: webhooks.updated_at
};

export function selectWebhooks(tx: Tx, agencyId: string, limit: number, offset: number) {
	return tx
		.select(webhookView)
		.from(webhooks)
		.where(eq(webhooks.agency_id, agencyId))
		.orderBy(asc(webhooks.created_at), asc(webhooks.id))
		.limit(limit)
		.offset(offset);
}

export async function countWebhooks(tx: Tx, agencyId: string) {
	const [row] = await tx
		.select({ n: count() })
		.from(webhooks)
		.where(eq(webhooks.agency_id, agencyId));
	return Number(row?.n ?? 0);
}

export async function selectWebhook(tx: Tx, agencyId: string, id: string) {
	const [row] = await tx
		.select(webhookView)
		.from(webhooks)
		.where(and(eq(webhooks.agency_id, agencyId), eq(webhooks.id, id)));
	return row ?? null;
}

export async function insertWebhook(tx: Tx, row: typeof webhooks.$inferInsert) {
	const [created] = await tx.insert(webhooks).values(row).returning(webhookView);
	return created;
}

export async function patchWebhook(
	tx: Tx,
	agencyId: string,
	id: string,
	set: Partial<Pick<typeof webhooks.$inferInsert, 'url' | 'events' | 'active' | 'description'>>
) {
	const [row] = await tx
		.update(webhooks)
		.set({ ...set, updated_at: new Date() })
		.where(and(eq(webhooks.agency_id, agencyId), eq(webhooks.id, id)))
		.returning(webhookView);
	return row ?? null;
}

export async function removeWebhook(tx: Tx, agencyId: string, id: string) {
	const rows = await tx
		.delete(webhooks)
		.where(and(eq(webhooks.agency_id, agencyId), eq(webhooks.id, id)))
		.returning({ id: webhooks.id });
	return rows.length > 0;
}

export function selectDeliveries(
	tx: Tx,
	agencyId: string,
	webhookId: string,
	limit: number,
	offset: number
) {
	return tx
		.select({
			id: webhookDeliveries.id,
			event: webhookDeliveries.event,
			status: webhookDeliveries.status,
			status_code: webhookDeliveries.status_code,
			attempted_at: webhookDeliveries.attempted_at,
			created_at: webhookDeliveries.created_at,
			response_time_ms: webhookDeliveries.response_time_ms,
			next_retry_at: webhookDeliveries.next_retry_at
		})
		.from(webhookDeliveries)
		.where(
			and(eq(webhookDeliveries.agency_id, agencyId), eq(webhookDeliveries.webhook_id, webhookId))
		)
		.orderBy(desc(webhookDeliveries.created_at), desc(webhookDeliveries.id))
		.limit(limit)
		.offset(offset);
}

export async function countDeliveries(tx: Tx, agencyId: string, webhookId: string) {
	const [row] = await tx
		.select({ n: count() })
		.from(webhookDeliveries)
		.where(
			and(eq(webhookDeliveries.agency_id, agencyId), eq(webhookDeliveries.webhook_id, webhookId))
		);
	return Number(row?.n ?? 0);
}

/** Active webhooks in every agency (the sweep runs as app_service). */
export function activeWebhooks(tx: Tx) {
	return (
		tx
			.select({
				id: webhooks.id,
				agencyId: webhooks.agency_id,
				events: webhooks.events,
				createdAt: webhooks.created_at
			})
			.from(webhooks)
			.leftJoin(apiKeys, eq(apiKeys.id, webhooks.created_by_key_id))
			// A webhook stops with the key that registered it.
			.where(and(eq(webhooks.active, true), isNull(apiKeys.revoked_at)))
	);
}

/** Pending deliveries whose next attempt is overdue, oldest first (the sweep re-queues them). */
export function overdueDeliveries(tx: Tx, before: Date) {
	return tx
		.select({ id: webhookDeliveries.id, attempts: webhookDeliveries.attempts })
		.from(webhookDeliveries)
		.where(
			and(eq(webhookDeliveries.status, 'pending'), lte(webhookDeliveries.next_retry_at, before))
		)
		.orderBy(asc(webhookDeliveries.next_retry_at))
		.limit(500);
}

/** Stops the webhooks a revoked key registered. */
export async function deactivateKeyWebhooks(tx: Tx, agencyId: string, keyId: string) {
	await tx
		.update(webhooks)
		.set({ active: false, updated_at: new Date() })
		.where(and(eq(webhooks.agency_id, agencyId), eq(webhooks.created_by_key_id, keyId)));
}

/** One page of the sweep's audit reads. */
export const AUDIT_PAGE = 2000;

/**
 * Audited changes to event tables after `since`, oldest first, one page at a
 * time (`page` from 0). Offsets rather than a (created_at, id) cursor: the
 * database keeps microseconds that a JavaScript Date would drop.
 */
export function auditChanges(
	tx: Tx,
	agencyId: string,
	tables: readonly string[],
	since: Date,
	page = 0
) {
	return tx
		.select({
			id: auditLog.id,
			table_name: auditLog.table_name,
			action: auditLog.action,
			old_values: auditLog.old_values,
			new_values: auditLog.new_values,
			created_at: auditLog.created_at
		})
		.from(auditLog)
		.where(
			and(
				eq(auditLog.agency_id, agencyId),
				inArray(auditLog.table_name, [...tables]),
				gt(auditLog.created_at, since)
			)
		)
		.orderBy(asc(auditLog.created_at), asc(auditLog.id))
		.limit(AUDIT_PAGE)
		.offset(page * AUDIT_PAGE);
}

/**
 * New deliveries; ones already made for the same webhook and audit row are
 * skipped. Inserted in chunks, under Postgres's limit on query parameters.
 */
export async function insertDeliveries(tx: Tx, rows: (typeof webhookDeliveries.$inferInsert)[]) {
	const ids: { id: string }[] = [];
	for (let i = 0; i < rows.length; i += 1000)
		ids.push(
			...(await tx
				.insert(webhookDeliveries)
				.values(rows.slice(i, i + 1000))
				.onConflictDoNothing({ target: [webhookDeliveries.webhook_id, webhookDeliveries.audit_id] })
				.returning({ id: webhookDeliveries.id }))
		);
	return ids;
}

export async function deliveryWithWebhook(tx: Tx, id: string) {
	const [row] = await tx
		.select({
			id: webhookDeliveries.id,
			agencyId: webhookDeliveries.agency_id,
			webhookId: webhookDeliveries.webhook_id,
			event: webhookDeliveries.event,
			payload: webhookDeliveries.payload,
			attempts: webhookDeliveries.attempts,
			status: webhookDeliveries.status,
			url: webhooks.url,
			active: webhooks.active,
			secretSealed: webhooks.secret_sealed
		})
		.from(webhookDeliveries)
		.innerJoin(
			webhooks,
			and(
				eq(webhooks.id, webhookDeliveries.webhook_id),
				eq(webhooks.agency_id, webhookDeliveries.agency_id)
			)
		)
		.where(eq(webhookDeliveries.id, id))
		// One sender at a time per delivery, even if a task runs twice.
		.for('update', { of: webhookDeliveries, skipLocked: true });
	return row ?? null;
}

export async function webhookSecret(tx: Tx, agencyId: string, id: string) {
	const [row] = await tx
		.select({ url: webhooks.url, secretSealed: webhooks.secret_sealed })
		.from(webhooks)
		.where(and(eq(webhooks.agency_id, agencyId), eq(webhooks.id, id)));
	return row ?? null;
}

export async function recordAttempt(
	tx: Tx,
	id: string,
	set: {
		status: 'delivered' | 'failed' | 'pending';
		status_code: number | null;
		response_time_ms: number | null;
		next_retry_at: Date | null;
		last_error: string | null;
	}
) {
	await tx
		.update(webhookDeliveries)
		.set({
			...set,
			attempts: sql`${webhookDeliveries.attempts} + 1`,
			attempted_at: new Date(),
			updated_at: new Date()
		})
		.where(eq(webhookDeliveries.id, id));
}
