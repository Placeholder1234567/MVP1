import { and, eq, gte, inArray, isNotNull, ne } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { Tx } from '../../db';
import {
	clients,
	coverageRequests,
	goals,
	incidents,
	marRecords,
	medications,
	noteGoals,
	noteHistory,
	notes,
	scheduleSlots
} from '../../db/schema';

// All run as app_user (supervisor): RLS keeps them in the agency.
const home = (column: AnyPgColumn, homeId?: string) => (homeId ? [eq(column, homeId)] : []);

export function coverageSince(tx: Tx, agencyId: string, since: Date, homeId?: string) {
	return tx
		.select({
			createdAt: coverageRequests.created_at,
			status: coverageRequests.status,
			filledAt: coverageRequests.filled_at
		})
		.from(coverageRequests)
		.where(
			and(
				eq(coverageRequests.agency_id, agencyId),
				gte(coverageRequests.created_at, since),
				...home(coverageRequests.home_id, homeId)
			)
		);
}

/** Note lifecycle events (signed, returned, approved) with the note's Lomi flag. */
export function noteEventsSince(tx: Tx, agencyId: string, since: Date, homeId?: string) {
	return tx
		.select({
			noteId: noteHistory.note_id,
			action: noteHistory.action,
			at: noteHistory.occurred_at,
			lomiDrafted: notes.lomi_drafted
		})
		.from(noteHistory)
		.innerJoin(notes, eq(notes.id, noteHistory.note_id))
		.where(
			and(
				eq(noteHistory.agency_id, agencyId),
				gte(noteHistory.occurred_at, since),
				inArray(noteHistory.action, ['signed', 'amended and resubmitted', 'approved', 'returned']),
				...home(notes.home_id, homeId)
			)
		);
}

export function dosesSince(tx: Tx, agencyId: string, sinceDay: string, homeId?: string) {
	return tx
		.select({
			id: marRecords.id,
			medication_id: marRecords.medication_id,
			day: marRecords.day,
			scheduled_time: marRecords.scheduled_time,
			status: marRecords.status,
			is_prn: marRecords.is_prn,
			amends_id: marRecords.amends_id
		})
		.from(marRecords)
		.where(
			and(
				eq(marRecords.agency_id, agencyId),
				gte(marRecords.day, sinceDay),
				...home(marRecords.home_id, homeId)
			)
		);
}

export function incidentsSince(tx: Tx, agencyId: string, since: Date, homeId?: string) {
	return tx
		.select({ occurredAt: incidents.occurred_at })
		.from(incidents)
		.where(
			and(
				eq(incidents.agency_id, agencyId),
				gte(incidents.occurred_at, since),
				...home(incidents.home_id, homeId)
			)
		);
}

/** Goal trials in the window, with the goal and the person's first name. */
export function goalTrialsSince(tx: Tx, agencyId: string, since: Date, homeId?: string) {
	return (
		tx
			.select({
				goalId: noteGoals.goal_id,
				trials: noteGoals.trials,
				goalText: goals.text,
				firstName: clients.first_name,
				name: clients.name
			})
			.from(noteGoals)
			// Only trials on signed notes: drafts and notes sent back aren't the record yet
			// (the goals report counts the same way).
			.innerJoin(
				notes,
				and(
					eq(notes.id, noteGoals.note_id),
					eq(notes.agency_id, noteGoals.agency_id),
					inArray(notes.status, ['submitted', 'approved'])
				)
			)
			.innerJoin(goals, eq(goals.id, noteGoals.goal_id))
			.innerJoin(clients, eq(clients.id, goals.client_id))
			.where(
				and(
					eq(noteGoals.agency_id, agencyId),
					gte(noteGoals.created_at, since),
					eq(noteGoals.not_attempted, false),
					...home(noteGoals.home_id, homeId)
				)
			)
	);
}

/** Scheduled medications of active people, for medication compliance. */
export function scheduledMeds(tx: Tx, agencyId: string, homeId?: string) {
	return tx
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
				eq(clients.active, true),
				isNotNull(medications.scheduled_times),
				...home(medications.home_id, homeId)
			)
		);
}

/** Assigned schedule slots from `sinceDay`, for documentation completeness. */
export function assignedSlotsSince(tx: Tx, agencyId: string, sinceDay: string, homeId?: string) {
	return tx
		.select({
			home_id: scheduleSlots.home_id,
			day: scheduleSlots.day,
			shift: scheduleSlots.shift,
			assigned_to: scheduleSlots.assigned_to
		})
		.from(scheduleSlots)
		.where(
			and(
				eq(scheduleSlots.agency_id, agencyId),
				gte(scheduleSlots.day, sinceDay),
				isNotNull(scheduleSlots.assigned_to),
				...home(scheduleSlots.home_id, homeId)
			)
		);
}

/** Signed (not draft) notes from `sinceDay`: who wrote one for which shift. */
export function signedNotesSince(tx: Tx, agencyId: string, sinceDay: string, homeId?: string) {
	return tx
		.selectDistinct({
			home_id: notes.home_id,
			day: notes.day,
			shift: notes.shift,
			author_id: notes.author_id,
			status: notes.status
		})
		.from(notes)
		.where(
			and(
				eq(notes.agency_id, agencyId),
				gte(notes.day, sinceDay),
				ne(notes.status, 'draft'),
				...home(notes.home_id, homeId)
			)
		);
}
