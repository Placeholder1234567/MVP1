import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { Tx } from '../../db';
import { agencies, clients, incidents } from '../../db/schema';

export async function insertIncident(tx: Tx, row: typeof incidents.$inferInsert) {
	const inserted = await tx
		.insert(incidents)
		.values(row)
		.onConflictDoNothing({ target: incidents.id })
		.returning({ id: incidents.id, createdAt: incidents.created_at });
	return inserted[0] ?? null;
}

export async function findIncident(tx: Tx, agencyId: string, id: string) {
	const [row] = await tx
		.select()
		.from(incidents)
		.where(and(eq(incidents.agency_id, agencyId), eq(incidents.id, id)))
		.limit(1);
	return row ?? null;
}

export interface IncidentFilter {
	homeId?: string;
	clientId?: string;
	status?: 'open' | 'reviewed' | 'closed';
	severity?: 'Low' | 'Medium' | 'High';
	limit: number;
	offset: number;
}

export function selectIncidents(tx: Tx, agencyId: string, f: IncidentFilter) {
	const where: SQL[] = [eq(incidents.agency_id, agencyId)];
	if (f.homeId) where.push(eq(incidents.home_id, f.homeId));
	if (f.clientId) where.push(eq(incidents.client_id, f.clientId));
	if (f.status) where.push(eq(incidents.status, f.status));
	if (f.severity) where.push(eq(incidents.severity, f.severity));
	return tx
		.select({
			id: incidents.id,
			clientId: incidents.client_id,
			clientName: clients.name,
			type: incidents.type,
			severity: incidents.severity,
			occurredAt: incidents.occurred_at,
			status: incidents.status,
			authorName: incidents.author_name,
			createdAt: incidents.created_at
		})
		.from(incidents)
		.innerJoin(clients, eq(clients.id, incidents.client_id))
		.where(and(...where))
		.orderBy(desc(incidents.occurred_at))
		.limit(f.limit)
		.offset(f.offset);
}

export async function updateIncident(
	tx: Tx,
	agencyId: string,
	id: string,
	set: Partial<Pick<typeof incidents.$inferInsert, 'followup_notes' | 'status'>>
) {
	const [row] = await tx
		.update(incidents)
		.set({ ...set, updated_at: new Date() })
		.where(and(eq(incidents.agency_id, agencyId), eq(incidents.id, id)))
		.returning({ updatedAt: incidents.updated_at, status: incidents.status });
	return row ?? null;
}

/** Appends a party to notified_parties unless it is already there. */
export async function addNotifiedParty(tx: Tx, agencyId: string, id: string, party: string) {
	const [row] = await tx
		.update(incidents)
		.set({
			notified_parties: sql`CASE WHEN ${party} = ANY(coalesce(${incidents.notified_parties}, '{}')) THEN ${incidents.notified_parties} ELSE array_append(coalesce(${incidents.notified_parties}, '{}'), ${party}) END`,
			updated_at: new Date()
		})
		.where(and(eq(incidents.agency_id, agencyId), eq(incidents.id, id)))
		.returning({ notifiedParties: incidents.notified_parties, updatedAt: incidents.updated_at });
	return row ?? null;
}

/** The agency's settings, which hold its incident reporting rules. */
export async function agencySettings(tx: Tx, agencyId: string) {
	const [row] = await tx
		.select({ settings: agencies.settings })
		.from(agencies)
		.where(eq(agencies.id, agencyId));
	return row?.settings ?? {};
}
