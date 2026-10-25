import { and, arrayContains, asc, desc, eq, gte, isNull } from 'drizzle-orm';
import type { RequestInfo, Tx } from '../../db';
import {
	auditLog,
	caseNotes,
	clientHealthInfo,
	clients,
	disclosures,
	goals,
	incidents,
	rooms
} from '../../db/schema';

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

/**
 * Frees the rooms a person occupies, when they move home or are discharged
 * (rooms are intake's, but nothing else clears occupied_by). Runs as
 * app_service, like intake's own room changes.
 */
export async function releaseRooms(tx: Tx, agencyId: string, clientId: string) {
	await tx
		.update(rooms)
		.set({ occupied_by: null, status: 'available', updated_at: new Date() })
		.where(and(eq(rooms.agency_id, agencyId), eq(rooms.occupied_by, clientId)));
}

// ─── Accounting of disclosures ─────────────────────────────────────────────

const disclosureColumns = {
	id: disclosures.id,
	date: disclosures.disclosed_on,
	recipient: disclosures.recipient,
	address: disclosures.recipient_address,
	description: disclosures.description,
	purpose: disclosures.purpose,
	detail: disclosures.purpose_detail,
	recordedBy: disclosures.recorded_by_name,
	createdAt: disclosures.created_at
};

export async function insertDisclosure(tx: Tx, row: typeof disclosures.$inferInsert) {
	const [created] = await tx.insert(disclosures).values(row).returning(disclosureColumns);
	return created;
}

/** Disclosures recorded for a person on or after `from` (YYYY-MM-DD), newest first. */
export function selectDisclosures(tx: Tx, agencyId: string, clientId: string, from: string) {
	return tx
		.select(disclosureColumns)
		.from(disclosures)
		.where(
			and(
				eq(disclosures.agency_id, agencyId),
				eq(disclosures.client_id, clientId),
				gte(disclosures.disclosed_on, from)
			)
		)
		.orderBy(desc(disclosures.disclosed_on), desc(disclosures.created_at));
}

/** A person's incidents marked as reported to the state (day filtering is the caller's). */
export function selectStateReportedIncidents(
	tx: Tx,
	agencyId: string,
	clientId: string,
	party: string
) {
	return tx
		.select({
			id: incidents.id,
			type: incidents.type,
			occurredAt: incidents.occurred_at,
			createdAt: incidents.created_at,
			authorName: incidents.author_name
		})
		.from(incidents)
		.where(
			and(
				eq(incidents.agency_id, agencyId),
				eq(incidents.client_id, clientId),
				arrayContains(incidents.notified_parties, [party])
			)
		);
}

/** The accounting given out, for the audit log (IDs and counts only). Runs as app_service. */
export async function recordAccountingExport(
	tx: Tx,
	agencyId: string,
	profileId: string,
	request: RequestInfo,
	scope: { clientId: string; fromDay: string; toDay: string; rows: number }
) {
	await tx.insert(auditLog).values({
		agency_id: agencyId,
		table_name: 'report_exports',
		record_id: crypto.randomUUID(),
		action: 'INSERT',
		performed_by: profileId,
		ip_address: request.ip,
		user_agent: request.user_agent,
		new_values: { type: 'disclosure_accounting', format: 'csv', ...scope }
	});
}
