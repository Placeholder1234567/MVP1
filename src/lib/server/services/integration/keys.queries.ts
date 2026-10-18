import { and, desc, eq, isNull, lt, or } from 'drizzle-orm';
import type { Tx } from '../../db';
import { agencies, apiKeys, auditLog } from '../../db/schema';

export function selectKeys(tx: Tx, agencyId: string) {
	return tx
		.select({
			id: apiKeys.id,
			name: apiKeys.name,
			prefix: apiKeys.key_prefix,
			scope: apiKeys.scope,
			lastUsedAt: apiKeys.last_used_at,
			revokedAt: apiKeys.revoked_at,
			createdAt: apiKeys.created_at
		})
		.from(apiKeys)
		.where(eq(apiKeys.agency_id, agencyId))
		.orderBy(desc(apiKeys.created_at))
		.limit(200);
}

export async function insertKey(
	tx: Tx,
	row: {
		agency_id: string;
		name: string;
		key_hash: string;
		key_prefix: string;
		scope: string;
		created_by: string;
	}
) {
	const [key] = await tx
		.insert(apiKeys)
		.values(row)
		.returning({ id: apiKeys.id, createdAt: apiKeys.created_at });
	return key;
}

export async function setRevoked(tx: Tx, agencyId: string, id: string) {
	const rows = await tx
		.update(apiKeys)
		.set({ revoked_at: new Date(), updated_at: new Date() })
		.where(and(eq(apiKeys.agency_id, agencyId), eq(apiKeys.id, id), isNull(apiKeys.revoked_at)))
		.returning({ id: apiKeys.id });
	return rows.length > 0;
}

/** The live key with this hash, and its agency's plan (app_service: the key is the only identity). */
export async function keyByHash(tx: Tx, keyHash: string) {
	const [row] = await tx
		.select({
			id: apiKeys.id,
			agencyId: apiKeys.agency_id,
			name: apiKeys.name,
			scope: apiKeys.scope,
			lastUsedAt: apiKeys.last_used_at,
			tier: agencies.subscription_tier,
			enabledFeatures: agencies.enabled_features,
			timeZone: agencies.timezone
		})
		.from(apiKeys)
		.innerJoin(agencies, eq(agencies.id, apiKeys.agency_id))
		.where(and(eq(apiKeys.key_hash, keyHash), isNull(apiKeys.revoked_at)));
	return row ?? null;
}

/** Records use at most once an hour, so the audit trigger isn't written on every call. */
export async function touchKey(tx: Tx, agencyId: string, id: string, now: Date) {
	await tx
		.update(apiKeys)
		.set({ last_used_at: now })
		.where(
			and(
				eq(apiKeys.agency_id, agencyId),
				eq(apiKeys.id, id),
				or(
					isNull(apiKeys.last_used_at),
					lt(apiKeys.last_used_at, new Date(now.getTime() - 3600_000))
				)
			)
		);
}

export async function insertAccess(
	tx: Tx,
	row: {
		agencyId: string;
		keyId: string;
		values: Record<string, unknown>;
		ip: string | null;
		userAgent: string | null;
	}
) {
	await tx.insert(auditLog).values({
		agency_id: row.agencyId,
		table_name: 'api_access',
		record_id: row.keyId,
		action: 'INSERT',
		new_values: row.values,
		ip_address: row.ip,
		user_agent: row.userAgent
	});
}
