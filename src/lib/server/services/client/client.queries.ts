import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { Tx } from '../../db';
import { caseNotes, clientHealthInfo, clients, goals } from '../../db/schema';

const columns = {
	id: clients.id,
	name: clients.name,
	firstName: clients.first_name,
	initials: clients.initials,
	homeId: clients.home_id,
	info: clients.info,
	behaviors: clients.behaviors,
	active: clients.active,
	createdAt: clients.created_at,
	updatedAt: clients.updated_at
};

// Runs as app_user: clients_select limits caregivers to their homes.
export function selectClients(
	tx: Tx,
	agencyId: string,
	filter: { homeId?: string; active?: boolean }
) {
	const where = [eq(clients.agency_id, agencyId)];
	if (filter.homeId) where.push(eq(clients.home_id, filter.homeId));
	if (filter.active !== undefined) where.push(eq(clients.active, filter.active));
	return tx
		.select(columns)
		.from(clients)
		.where(and(...where))
		.orderBy(asc(clients.name));
}

export async function selectClient(tx: Tx, agencyId: string, id: string) {
	const [row] = await tx
		.select(columns)
		.from(clients)
		.where(and(eq(clients.agency_id, agencyId), eq(clients.id, id)))
		.limit(1);
	return row ?? null;
}

export async function selectHealthInfo(tx: Tx, agencyId: string, clientId: string) {
	const [row] = await tx
		.select({
			allergies: clientHealthInfo.allergies,
			conditions: clientHealthInfo.conditions,
			diet: clientHealthInfo.diet,
			doctor: clientHealthInfo.doctor,
			guardian: clientHealthInfo.guardian,
			dob: clientHealthInfo.dob,
			vitalLimits: clientHealthInfo.vital_limits,
			updatedAt: clientHealthInfo.updated_at
		})
		.from(clientHealthInfo)
		.where(and(eq(clientHealthInfo.agency_id, agencyId), eq(clientHealthInfo.client_id, clientId)))
		.limit(1);
	return row ?? null;
}

/** Active goals (not stopped). */
export function selectActiveGoals(tx: Tx, agencyId: string, clientId: string) {
	return tx
		.select({
			id: goals.id,
			area: goals.area,
			text: goals.text,
			steps: goals.steps,
			frequency: goals.frequency,
			target: goals.target,
			startedAt: goals.started_at
		})
		.from(goals)
		.where(
			and(eq(goals.agency_id, agencyId), eq(goals.client_id, clientId), isNull(goals.stopped_at))
		)
		.orderBy(asc(goals.area));
}

export async function insertClient(tx: Tx, row: typeof clients.$inferInsert) {
	const [created] = await tx.insert(clients).values(row).returning(columns);
	return created;
}

export async function upsertHealthInfo(tx: Tx, row: typeof clientHealthInfo.$inferInsert) {
	const [saved] = await tx
		.insert(clientHealthInfo)
		.values(row)
		.onConflictDoUpdate({
			target: clientHealthInfo.client_id,
			set: {
				allergies: row.allergies,
				conditions: row.conditions,
				diet: row.diet,
				doctor: row.doctor,
				guardian: row.guardian,
				dob: row.dob,
				vital_limits: row.vital_limits,
				updated_at: new Date()
			}
		})
		.returning({ id: clientHealthInfo.id, updatedAt: clientHealthInfo.updated_at });
	return saved;
}

export async function updateClientRow(
	tx: Tx,
	agencyId: string,
	id: string,
	set: Partial<typeof clients.$inferInsert>
) {
	const [row] = await tx
		.update(clients)
		.set({ ...set, updated_at: new Date() })
		.where(and(eq(clients.agency_id, agencyId), eq(clients.id, id)))
		.returning(columns);
	return row ?? null;
}

export function selectCaseNotes(
	tx: Tx,
	agencyId: string,
	clientId: string,
	limit: number,
	offset: number
) {
	return tx
		.select({
			id: caseNotes.id,
			authorName: caseNotes.author_name,
			body: caseNotes.body,
			category: caseNotes.category,
			createdAt: caseNotes.created_at
		})
		.from(caseNotes)
		.where(and(eq(caseNotes.agency_id, agencyId), eq(caseNotes.client_id, clientId)))
		.orderBy(desc(caseNotes.created_at))
		.limit(limit)
		.offset(offset);
}

export async function insertCaseNote(tx: Tx, row: typeof caseNotes.$inferInsert) {
	const [created] = await tx.insert(caseNotes).values(row).returning({
		id: caseNotes.id,
		clientId: caseNotes.client_id,
		authorName: caseNotes.author_name,
		body: caseNotes.body,
		category: caseNotes.category,
		createdAt: caseNotes.created_at
	});
	return created;
}
