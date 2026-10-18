import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Tx } from '../../db';
import { clients, medicationHistory, medications, profiles } from '../../db/schema';

export async function lockedMedicationClient(tx: Tx, agencyId: string, id: string) {
	return (
		await tx
			.select({ id: clients.id, homeId: clients.home_id, active: clients.active })
			.from(clients)
			.where(and(eq(clients.agency_id, agencyId), eq(clients.id, id)))
			.for('update')
	)[0];
}
export async function managementMedication(tx: Tx, agencyId: string, id: string, lock = false) {
	const query = tx
		.select()
		.from(medications)
		.where(and(eq(medications.agency_id, agencyId), eq(medications.id, id)))
		.limit(1);
	return (await (lock ? query.for('update') : query))[0];
}
export async function insertManagedMedication(tx: Tx, row: typeof medications.$inferInsert) {
	return (await tx.insert(medications).values(row).returning())[0];
}
export async function updateManagedMedication(
	tx: Tx,
	agencyId: string,
	id: string,
	fields: Partial<
		Pick<
			typeof medications.$inferInsert,
			| 'name'
			| 'dose'
			| 'route'
			| 'scheduled_times'
			| 'prn_instructions'
			| 'notes'
			| 'stopped_at'
			| 'controlled'
			| 'controlled_schedule'
			| 'units_per_dose'
		>
	>
) {
	return (
		await tx
			.update(medications)
			.set({ ...fields, updated_at: new Date() })
			.where(
				and(
					eq(medications.agency_id, agencyId),
					eq(medications.id, id),
					isNull(medications.stopped_at)
				)
			)
			.returning()
	)[0];
}
export async function appendMedicationHistory(
	tx: Tx,
	agencyId: string,
	medicationId: string,
	actor: string,
	action: 'added' | 'updated' | 'stopped'
) {
	await tx.insert(medicationHistory).values({
		agency_id: agencyId,
		medication_id: medicationId,
		changed_by: actor,
		action,
		changed_at: new Date()
	});
}
export function managementHistory(tx: Tx, agencyId: string, medicationId: string) {
	return tx
		.select({
			id: medicationHistory.id,
			action: medicationHistory.action,
			changedBy: medicationHistory.changed_by,
			changedByName: profiles.name,
			changedAt: medicationHistory.changed_at
		})
		.from(medicationHistory)
		.leftJoin(
			profiles,
			and(eq(profiles.id, medicationHistory.changed_by), eq(profiles.agency_id, agencyId))
		)
		.where(
			and(
				eq(medicationHistory.agency_id, agencyId),
				eq(medicationHistory.medication_id, medicationId)
			)
		)
		.orderBy(desc(medicationHistory.changed_at), desc(medicationHistory.id))
		.limit(501);
}
