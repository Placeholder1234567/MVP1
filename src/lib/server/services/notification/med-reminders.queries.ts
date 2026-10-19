import { and, arrayContains, eq, gt, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm';
import type { Tx } from '../../db';
import {
	clients,
	homes,
	marRecords,
	medications,
	notifications,
	profiles,
	scheduleSlots
} from '../../db/schema';

/** Scheduled (not as-needed) medications of active people at a home, still running at `since`. */
export function scheduledMeds(tx: Tx, agencyId: string, since: Date) {
	return tx
		.select({
			id: medications.id,
			homeId: medications.home_id,
			scheduled_times: medications.scheduled_times,
			started_at: medications.started_at,
			stopped_at: medications.stopped_at
		})
		.from(medications)
		.innerJoin(
			clients,
			and(eq(clients.id, medications.client_id), eq(clients.agency_id, medications.agency_id))
		)
		.where(
			and(
				eq(medications.agency_id, agencyId),
				eq(clients.active, true),
				isNotNull(medications.home_id),
				isNotNull(medications.scheduled_times),
				or(isNull(medications.stopped_at), gt(medications.stopped_at, since))
			)
		);
}

export function doseRecords(tx: Tx, agencyId: string, medicationIds: string[], days: string[]) {
	if (!medicationIds.length) return Promise.resolve([]);
	return tx
		.select({
			medication_id: marRecords.medication_id,
			day: marRecords.day,
			scheduled_time: marRecords.scheduled_time,
			is_prn: marRecords.is_prn,
			amends_id: marRecords.amends_id,
			conflict_with: marRecords.conflict_with
		})
		.from(marRecords)
		.where(
			and(
				eq(marRecords.agency_id, agencyId),
				inArray(marRecords.medication_id, medicationIds),
				inArray(marRecords.day, days)
			)
		);
}

/** Active caregivers assigned to any of the home's given shifts. */
export function assignedCaregivers(
	tx: Tx,
	agencyId: string,
	homeId: string,
	shifts: { day: string; shift: 'am' | 'pm' | 'on' }[]
) {
	return tx
		.selectDistinct({ id: profiles.id, role: profiles.role })
		.from(scheduleSlots)
		.innerJoin(profiles, eq(profiles.id, scheduleSlots.assigned_to))
		.where(
			and(
				eq(scheduleSlots.agency_id, agencyId),
				eq(scheduleSlots.home_id, homeId),
				or(
					...shifts.map((s) => and(eq(scheduleSlots.day, s.day), eq(scheduleSlots.shift, s.shift)))
				),
				eq(profiles.agency_id, agencyId),
				eq(profiles.active, true),
				// Still working at the home: a slot can outlast a change of homes.
				arrayContains(profiles.home_ids, [homeId])
			)
		);
}

/** Whether this alert (by its stable reference ID) was already sent. */
export async function alreadySent(tx: Tx, agencyId: string, type: string, referenceId: string) {
	const rows = await tx
		.select({ id: notifications.id })
		.from(notifications)
		.where(
			and(
				eq(notifications.agency_id, agencyId),
				eq(notifications.type, type),
				eq(notifications.reference_id, referenceId)
			)
		)
		.limit(1);
	return rows.length > 0;
}

export function homeNamesFor(tx: Tx, agencyId: string, ids: string[]) {
	if (!ids.length) return Promise.resolve([]);
	return tx
		.select({ id: homes.id, name: homes.name })
		.from(homes)
		.where(and(eq(homes.agency_id, agencyId), inArray(homes.id, ids)));
}

/**
 * As-needed doses given between `from` and `to` with no effect recorded yet,
 * with whoever recorded them (when still active).
 */
export function prnDosesAwaitingEffect(tx: Tx, agencyId: string, from: Date, to: Date) {
	return tx
		.select({ id: marRecords.id, profileId: profiles.id, role: profiles.role })
		.from(marRecords)
		.innerJoin(
			profiles,
			and(eq(profiles.id, marRecords.recorded_by), eq(profiles.agency_id, marRecords.agency_id))
		)
		.where(
			and(
				eq(marRecords.agency_id, agencyId),
				eq(marRecords.is_prn, true),
				eq(marRecords.status, 'given'),
				isNull(marRecords.effect),
				isNull(marRecords.amends_id),
				gt(marRecords.recorded_at, from),
				lte(marRecords.recorded_at, to),
				eq(profiles.active, true)
			)
		);
}
