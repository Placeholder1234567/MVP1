import { and, asc, eq, gte, isNull, lte } from 'drizzle-orm';
import type { Tx } from '../../db';
import { clients, marRecords, medications } from '../../db/schema';

export async function findMedication(
	tx: Tx,
	agencyId: string,
	clientId: string,
	medicationId: string
) {
	const [row] = await tx
		.select({
			id: medications.id,
			scheduled_times: medications.scheduled_times,
			stopped_at: medications.stopped_at,
			homeId: clients.home_id
		})
		.from(medications)
		.innerJoin(clients, eq(clients.id, medications.client_id))
		.where(
			and(
				eq(medications.agency_id, agencyId),
				eq(medications.id, medicationId),
				eq(medications.client_id, clientId)
			)
		)
		.limit(1);
	return row ?? null;
}

export async function findMarRecord(tx: Tx, agencyId: string, id: string) {
	const [row] = await tx
		.select({ id: marRecords.id })
		.from(marRecords)
		.where(and(eq(marRecords.agency_id, agencyId), eq(marRecords.id, id)))
		.limit(1);
	return row ?? null;
}

/** The original (non-amendment, non-conflict) record for a scheduled dose slot. */
export async function findSlotOriginal(
	tx: Tx,
	agencyId: string,
	slot: { clientId: string; medicationId: string; day: string; time: string }
) {
	const [row] = await tx
		.select({ id: marRecords.id, recordedByName: marRecords.recorded_by_name })
		.from(marRecords)
		.where(
			and(
				eq(marRecords.agency_id, agencyId),
				eq(marRecords.client_id, slot.clientId),
				eq(marRecords.medication_id, slot.medicationId),
				eq(marRecords.day, slot.day),
				eq(marRecords.scheduled_time, slot.time),
				eq(marRecords.is_prn, false),
				isNull(marRecords.amends_id),
				isNull(marRecords.conflict_with)
			)
		)
		.limit(1);
	return row ?? null;
}

/** Inserts unless a record with this ID exists (a retried upload). Returns true if inserted. */
export async function insertMarRecord(
	tx: Tx,
	row: typeof marRecords.$inferInsert
): Promise<boolean> {
	const inserted = await tx
		.insert(marRecords)
		.values(row)
		.onConflictDoNothing({ target: marRecords.id })
		.returning({ id: marRecords.id });
	return inserted.length > 0;
}

export async function findDoseForEffect(tx: Tx, agencyId: string, id: string) {
	const [row] = await tx
		.select({
			id: marRecords.id,
			isPrn: marRecords.is_prn,
			effect: marRecords.effect,
			status: marRecords.status
		})
		.from(marRecords)
		.where(and(eq(marRecords.agency_id, agencyId), eq(marRecords.id, id)))
		.limit(1);
	return row ?? null;
}

export async function setMarFields(
	tx: Tx,
	agencyId: string,
	id: string,
	set: Partial<Pick<typeof marRecords.$inferInsert, 'effect' | 'acknowledged'>>
) {
	const [row] = await tx
		.update(marRecords)
		.set({ ...set, updated_at: new Date() })
		.where(and(eq(marRecords.agency_id, agencyId), eq(marRecords.id, id)))
		.returning({ updatedAt: marRecords.updated_at });
	return row?.updatedAt ?? null;
}

export function selectMar(
	tx: Tx,
	agencyId: string,
	clientId: string,
	range: { from: string; to: string }
) {
	return tx
		.select({
			id: marRecords.id,
			clientId: marRecords.client_id,
			medicationId: marRecords.medication_id,
			medicationName: medications.name,
			dose: medications.dose,
			route: medications.route,
			scheduledTime: marRecords.scheduled_time,
			day: marRecords.day,
			status: marRecords.status,
			amendsId: marRecords.amends_id,
			conflictWith: marRecords.conflict_with,
			recordedAt: marRecords.recorded_at,
			recordedByName: marRecords.recorded_by_name,
			reason: marRecords.reason,
			effect: marRecords.effect,
			isPrn: marRecords.is_prn,
			acknowledged: marRecords.acknowledged
		})
		.from(marRecords)
		.innerJoin(medications, eq(medications.id, marRecords.medication_id))
		.where(
			and(
				eq(marRecords.agency_id, agencyId),
				eq(marRecords.client_id, clientId),
				gte(marRecords.day, range.from),
				lte(marRecords.day, range.to)
			)
		)
		.orderBy(asc(marRecords.day), asc(marRecords.scheduled_time), asc(marRecords.recorded_at));
}

export function selectMedications(
	tx: Tx,
	agencyId: string,
	clientId: string,
	includeStopped: boolean
) {
	const where = [eq(medications.agency_id, agencyId), eq(medications.client_id, clientId)];
	if (!includeStopped) where.push(isNull(medications.stopped_at));
	return tx
		.select({
			id: medications.id,
			name: medications.name,
			dose: medications.dose,
			route: medications.route,
			scheduledTimes: medications.scheduled_times,
			prnInstructions: medications.prn_instructions,
			notes: medications.notes,
			startedAt: medications.started_at,
			stoppedAt: medications.stopped_at
		})
		.from(medications)
		.where(and(...where))
		.orderBy(asc(medications.name));
}
