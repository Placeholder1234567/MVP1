import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import type { Tx } from '../../db';
import {
	clients,
	homes,
	notes,
	noteHistory,
	marRecords,
	healthEntries,
	incidents,
	attendance
} from '../../db/schema';
import type { ClinicalType, ClinicalRow } from '../../../domain/clinical-export';

export async function clinicalScope(tx: Tx, agencyId: string, homeId: string, clientId?: string) {
	const home = await tx
		.select({ id: homes.id })
		.from(homes)
		.where(and(eq(homes.agency_id, agencyId), eq(homes.id, homeId)))
		.limit(1);
	if (!home.length) return false;
	if (!clientId) return true;
	const client = await tx
		.select({ id: clients.id })
		.from(clients)
		.where(
			and(eq(clients.agency_id, agencyId), eq(clients.home_id, homeId), eq(clients.id, clientId))
		)
		.limit(1);
	return client.length > 0;
}

export interface ClinicalFilter {
	type: ClinicalType;
	homeId: string;
	clientId?: string;
	fromDay: string;
	toDayExclusive: string;
	from: Date;
	to: Date;
	approvedOnly: boolean;
}
export async function clinicalRows(
	tx: Tx,
	agencyId: string,
	f: ClinicalFilter
): Promise<ClinicalRow[]> {
	const base = { clientName: clients.name };
	const clientWhere = and(
		eq(clients.agency_id, agencyId),
		f.clientId ? eq(clients.id, f.clientId) : undefined
	);
	const cap = 1001;
	switch (f.type) {
		case 'notes':
			return tx
				.select({
					...base,
					id: notes.id,
					clientId: notes.client_id,
					homeId: notes.home_id,
					day: notes.day,
					shift: notes.shift,
					type: notes.type,
					content: notes.content,
					status: notes.status,
					authorId: notes.author_id,
					authorName: notes.author_name,
					aiDrafted: notes.lomi_drafted
				})
				.from(notes)
				.innerJoin(clients, eq(clients.id, notes.client_id))
				.where(
					and(
						clientWhere,
						eq(notes.agency_id, agencyId),
						eq(notes.home_id, f.homeId),
						gte(notes.day, f.fromDay),
						lt(notes.day, f.toDayExclusive),
						f.approvedOnly
							? eq(notes.status, 'approved')
							: inArray(notes.status, ['submitted', 'approved'])
					)
				)
				.orderBy(asc(notes.day), asc(notes.id))
				.limit(cap);
		case 'mar':
			return tx
				.select({
					...base,
					id: marRecords.id,
					clientId: marRecords.client_id,
					homeId: marRecords.home_id,
					day: marRecords.day,
					scheduledTime: marRecords.scheduled_time,
					medicationId: marRecords.medication_id,
					status: marRecords.status,
					recordedAt: marRecords.recorded_at,
					recordedBy: marRecords.recorded_by,
					recordedByName: marRecords.recorded_by_name,
					reason: marRecords.reason,
					effect: marRecords.effect,
					prn: marRecords.is_prn,
					acknowledged: marRecords.acknowledged,
					amendsId: marRecords.amends_id,
					conflictWith: marRecords.conflict_with
				})
				.from(marRecords)
				.innerJoin(clients, eq(clients.id, marRecords.client_id))
				.where(
					and(
						clientWhere,
						eq(marRecords.agency_id, agencyId),
						eq(marRecords.home_id, f.homeId),
						gte(marRecords.day, f.fromDay),
						lt(marRecords.day, f.toDayExclusive)
					)
				)
				.orderBy(asc(marRecords.day), asc(marRecords.id))
				.limit(cap);
		case 'health':
			return tx
				.select({
					...base,
					id: healthEntries.id,
					clientId: healthEntries.client_id,
					homeId: healthEntries.home_id,
					kind: healthEntries.kind,
					data: healthEntries.data,
					recordedAt: healthEntries.recorded_at,
					recordedBy: healthEntries.recorded_by,
					flags: healthEntries.flags,
					acknowledged: healthEntries.acknowledged
				})
				.from(healthEntries)
				.innerJoin(clients, eq(clients.id, healthEntries.client_id))
				.where(
					and(
						clientWhere,
						eq(healthEntries.agency_id, agencyId),
						eq(healthEntries.home_id, f.homeId),
						gte(healthEntries.recorded_at, f.from),
						lt(healthEntries.recorded_at, f.to)
					)
				)
				.orderBy(asc(healthEntries.recorded_at), asc(healthEntries.id))
				.limit(cap);
		case 'incidents':
			return tx
				.select({
					...base,
					id: incidents.id,
					clientId: incidents.client_id,
					homeId: incidents.home_id,
					type: incidents.type,
					severity: incidents.severity,
					occurredAt: incidents.occurred_at,
					description: incidents.description,
					staffAction: incidents.staff_action,
					medicalFollowup: incidents.medical_followup,
					status: incidents.status,
					followup: incidents.followup_notes,
					authorId: incidents.author_id,
					authorName: incidents.author_name
				})
				.from(incidents)
				.innerJoin(clients, eq(clients.id, incidents.client_id))
				.where(
					and(
						clientWhere,
						eq(incidents.agency_id, agencyId),
						eq(incidents.home_id, f.homeId),
						gte(incidents.occurred_at, f.from),
						lt(incidents.occurred_at, f.to)
					)
				)
				.orderBy(asc(incidents.occurred_at), asc(incidents.id))
				.limit(cap);
		case 'attendance':
			return tx
				.select({
					...base,
					id: attendance.id,
					clientId: attendance.client_id,
					homeId: attendance.home_id,
					day: attendance.day,
					services: attendance.services,
					recordedAt: attendance.recorded_at,
					recordedBy: attendance.recorded_by,
					recordedByName: attendance.recorded_by_name
				})
				.from(attendance)
				.innerJoin(clients, eq(clients.id, attendance.client_id))
				.where(
					and(
						clientWhere,
						eq(attendance.agency_id, agencyId),
						eq(attendance.home_id, f.homeId),
						gte(attendance.day, f.fromDay),
						lt(attendance.day, f.toDayExclusive)
					)
				)
				.orderBy(asc(attendance.day), asc(attendance.id))
				.limit(cap);
	}
}

export function clinicalNoteHistory(tx: Tx, agencyId: string, ids: string[]) {
	return tx
		.select({
			noteId: noteHistory.note_id,
			action: noteHistory.action,
			byName: noteHistory.by_name,
			occurredAt: noteHistory.occurred_at
		})
		.from(noteHistory)
		.where(
			and(
				eq(noteHistory.agency_id, agencyId),
				inArray(noteHistory.note_id, ids),
				inArray(noteHistory.action, ['signed', 'amended and resubmitted', 'approved'])
			)
		)
		.orderBy(asc(noteHistory.occurred_at))
		.limit(5001);
}
