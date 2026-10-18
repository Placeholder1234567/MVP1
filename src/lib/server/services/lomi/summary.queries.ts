import { and, eq, gte, isNull, lt, or } from 'drizzle-orm';
import type { Tx } from '../../db';
import {
	clients,
	clockRecords,
	coverageRequests,
	healthEntries,
	homes,
	incidents,
	marRecords,
	medications,
	notes,
	scheduleSlots
} from '../../db/schema';

export async function homeName(tx: Tx, agencyId: string, homeId: string) {
	const [home] = await tx
		.select({ name: homes.name })
		.from(homes)
		.where(and(eq(homes.agency_id, agencyId), eq(homes.id, homeId)));
	return home?.name ?? null;
}

export function homePeople(tx: Tx, agencyId: string, homeId: string) {
	return tx
		.select({ id: clients.id, name: clients.name, firstName: clients.first_name })
		.from(clients)
		.where(
			and(eq(clients.agency_id, agencyId), eq(clients.home_id, homeId), eq(clients.active, true))
		);
}

/** One query at a time: they share the transaction's connection. */
export async function dayRecords(
	tx: Tx,
	agencyId: string,
	homeId: string,
	day: string,
	start: Date,
	end: Date
) {
	const slots = await tx
		.select({ shift: scheduleSlots.shift, status: scheduleSlots.status })
		.from(scheduleSlots)
		.where(
			and(
				eq(scheduleSlots.agency_id, agencyId),
				eq(scheduleSlots.home_id, homeId),
				eq(scheduleSlots.day, day)
			)
		);
	const coverage = await tx
		.select({ shift: coverageRequests.shift, status: coverageRequests.status })
		.from(coverageRequests)
		.where(
			and(
				eq(coverageRequests.agency_id, agencyId),
				eq(coverageRequests.home_id, homeId),
				eq(coverageRequests.day, day)
			)
		);
	const dayNotes = await tx
		.select({ clientId: notes.client_id, type: notes.type, status: notes.status })
		.from(notes)
		.where(and(eq(notes.agency_id, agencyId), eq(notes.home_id, homeId), eq(notes.day, day)));
	const toReview = await tx
		.select({ id: notes.id })
		.from(notes)
		.where(
			and(eq(notes.agency_id, agencyId), eq(notes.home_id, homeId), eq(notes.status, 'submitted'))
		);
	const openIncidents = await tx
		.select({ clientId: incidents.client_id, type: incidents.type, severity: incidents.severity })
		.from(incidents)
		.where(
			and(
				eq(incidents.agency_id, agencyId),
				eq(incidents.home_id, homeId),
				eq(incidents.status, 'open')
			)
		);
	const doses = await tx
		.select({
			clientId: marRecords.client_id,
			medication_id: marRecords.medication_id,
			day: marRecords.day,
			scheduled_time: marRecords.scheduled_time,
			status: marRecords.status,
			is_prn: marRecords.is_prn,
			amends_id: marRecords.amends_id,
			conflict_with: marRecords.conflict_with
		})
		.from(marRecords)
		.where(
			and(
				eq(marRecords.agency_id, agencyId),
				eq(marRecords.home_id, homeId),
				eq(marRecords.day, day)
			)
		);
	const meds = await tx
		.select({
			id: medications.id,
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
				eq(medications.home_id, homeId),
				eq(clients.active, true),
				or(isNull(medications.stopped_at), gte(medications.stopped_at, start))
			)
		);
	const health = await tx
		.select({ clientId: healthEntries.client_id, flags: healthEntries.flags })
		.from(healthEntries)
		.where(
			and(
				eq(healthEntries.agency_id, agencyId),
				eq(healthEntries.home_id, homeId),
				eq(healthEntries.acknowledged, false),
				lt(healthEntries.recorded_at, end)
			)
		);
	const clock = await tx
		.select({ id: clockRecords.id })
		.from(clockRecords)
		.where(
			and(
				eq(clockRecords.agency_id, agencyId),
				eq(clockRecords.home_id, homeId),
				eq(clockRecords.verified, false),
				eq(clockRecords.acknowledged, false),
				gte(clockRecords.clock_in_at, start),
				lt(clockRecords.clock_in_at, end)
			)
		);
	return { slots, coverage, dayNotes, toReview, openIncidents, doses, meds, health, clock };
}
