import { and, eq, isNull } from 'drizzle-orm';
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
