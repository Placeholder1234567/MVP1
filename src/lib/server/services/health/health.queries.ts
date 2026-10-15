import { and, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import type { Tx } from '../../db';
import { clients, healthEntries, profiles } from '../../db/schema';

export async function insertHealthEntry(tx: Tx, row: typeof healthEntries.$inferInsert) {
	const inserted = await tx
		.insert(healthEntries)
		.values(row)
		.onConflictDoNothing({ target: healthEntries.id })
		.returning({ id: healthEntries.id, recordedAt: healthEntries.recorded_at });
	return inserted[0] ?? null;
}

export interface HealthFilter {
	clientId?: string;
	homeId?: string;
	kind?: 'vitals' | 'seizure' | 'illness' | 'appointment';
	from?: Date;
	to?: Date;
	limit: number;
	offset: number;
}

/** Flagged entries first, then newest first. */
export function selectHealthEntries(tx: Tx, agencyId: string, f: HealthFilter) {
	const where: SQL[] = [eq(healthEntries.agency_id, agencyId)];
	if (f.clientId) where.push(eq(healthEntries.client_id, f.clientId));
	if (f.homeId) where.push(eq(healthEntries.home_id, f.homeId));
	if (f.kind) where.push(eq(healthEntries.kind, f.kind));
	if (f.from) where.push(gte(healthEntries.recorded_at, f.from));
	if (f.to) where.push(lte(healthEntries.recorded_at, f.to));
	return tx
		.select({
			id: healthEntries.id,
			clientId: healthEntries.client_id,
			clientName: clients.name,
			kind: healthEntries.kind,
			data: healthEntries.data,
			recordedAt: healthEntries.recorded_at,
			recordedByName: profiles.name,
			flags: healthEntries.flags,
			acknowledged: healthEntries.acknowledged
		})
		.from(healthEntries)
		.innerJoin(clients, eq(clients.id, healthEntries.client_id))
		.leftJoin(profiles, eq(profiles.id, healthEntries.recorded_by))
		.where(and(...where))
		.orderBy(
			desc(sql`coalesce(array_length(${healthEntries.flags}, 1), 0) > 0`),
			desc(healthEntries.recorded_at)
		)
		.limit(f.limit)
		.offset(f.offset);
}

export async function acknowledgeHealthEntry(tx: Tx, agencyId: string, id: string) {
	const [row] = await tx
		.update(healthEntries)
		.set({ acknowledged: true, updated_at: new Date() })
		.where(and(eq(healthEntries.agency_id, agencyId), eq(healthEntries.id, id)))
		.returning({ updatedAt: healthEntries.updated_at });
	return row?.updatedAt ?? null;
}
