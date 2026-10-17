import { and, eq, gte, inArray } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { Tx } from '../../db';
import {
	clients,
	coverageRequests,
	goals,
	incidents,
	marRecords,
	noteGoals,
	noteHistory,
	notes
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
		.select({ day: marRecords.day, status: marRecords.status })
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
	return tx
		.select({
			goalId: noteGoals.goal_id,
			trials: noteGoals.trials,
			goalText: goals.text,
			firstName: clients.first_name,
			name: clients.name
		})
		.from(noteGoals)
		.innerJoin(goals, eq(goals.id, noteGoals.goal_id))
		.innerJoin(clients, eq(clients.id, goals.client_id))
		.where(
			and(
				eq(noteGoals.agency_id, agencyId),
				gte(noteGoals.created_at, since),
				eq(noteGoals.not_attempted, false),
				...home(noteGoals.home_id, homeId)
			)
		);
}
