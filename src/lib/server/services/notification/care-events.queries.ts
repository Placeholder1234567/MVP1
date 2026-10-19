import { and, eq, gt, inArray, isNotNull, lte, ne } from 'drizzle-orm';
import type { Tx } from '../../db';
import {
	agencies,
	homes,
	incidents,
	notes,
	notifications,
	profiles,
	scheduleSlots
} from '../../db/schema';

/** What a note notification says and who gets it; no note content. */
export async function noteFacts(tx: Tx, agencyId: string, noteId: string) {
	const [row] = await tx
		.select({
			homeId: notes.home_id,
			homeName: homes.name,
			day: notes.day,
			type: notes.type,
			authorId: notes.author_id,
			authorName: notes.author_name,
			authorRole: profiles.role,
			authorActive: profiles.active
		})
		.from(notes)
		.leftJoin(homes, and(eq(homes.id, notes.home_id), eq(homes.agency_id, agencyId)))
		.leftJoin(profiles, and(eq(profiles.id, notes.author_id), eq(profiles.agency_id, agencyId)))
		.where(and(eq(notes.agency_id, agencyId), eq(notes.id, noteId)))
		.limit(1);
	return row ?? null;
}

export async function homeName(tx: Tx, agencyId: string, homeId: string | null) {
	if (!homeId) return null;
	const [row] = await tx
		.select({ name: homes.name })
		.from(homes)
		.where(and(eq(homes.agency_id, agencyId), eq(homes.id, homeId)))
		.limit(1);
	return row?.name ?? null;
}

/** Filled slots on these days whose assignee is still active, with the home name. */
export function assignedSlots(tx: Tx, agencyId: string, days: string[]) {
	return tx
		.select({
			id: scheduleSlots.id,
			day: scheduleSlots.day,
			shift: scheduleSlots.shift,
			homeName: homes.name,
			profileId: profiles.id,
			role: profiles.role
		})
		.from(scheduleSlots)
		.innerJoin(homes, eq(homes.id, scheduleSlots.home_id))
		.innerJoin(profiles, eq(profiles.id, scheduleSlots.assigned_to))
		.where(
			and(
				eq(scheduleSlots.agency_id, agencyId),
				inArray(scheduleSlots.day, days),
				eq(scheduleSlots.status, 'filled'),
				isNotNull(scheduleSlots.assigned_to),
				eq(profiles.active, true)
			)
		);
}

/** Incidents still open that were reported between `from` and `to`. */
export function openIncidents(tx: Tx, agencyId: string, from: Date, to: Date) {
	return tx
		.select({
			id: incidents.id,
			homeId: incidents.home_id,
			homeName: homes.name,
			occurredAt: incidents.occurred_at,
			createdAt: incidents.created_at
		})
		.from(incidents)
		.leftJoin(homes, eq(homes.id, incidents.home_id))
		.where(
			and(
				eq(incidents.agency_id, agencyId),
				eq(incidents.status, 'open'),
				gt(incidents.created_at, from),
				lte(incidents.created_at, to)
			)
		);
}

/** Incidents not yet closed since `from`, with what decides who must be told. */
export function openIncidentContacts(tx: Tx, agencyId: string, from: Date) {
	return tx
		.select({
			id: incidents.id,
			homeId: incidents.home_id,
			homeName: homes.name,
			type: incidents.type,
			severity: incidents.severity,
			notifiedParties: incidents.notified_parties,
			occurredAt: incidents.occurred_at,
			createdAt: incidents.created_at
		})
		.from(incidents)
		.leftJoin(homes, eq(homes.id, incidents.home_id))
		.where(
			and(
				eq(incidents.agency_id, agencyId),
				// Reviewing doesn't tell anyone: only marking the contact told or closing stops these.
				ne(incidents.status, 'closed'),
				gt(incidents.created_at, from)
			)
		);
}

export async function agencySettingsFor(tx: Tx, agencyId: string) {
	const [row] = await tx
		.select({ settings: agencies.settings })
		.from(agencies)
		.where(eq(agencies.id, agencyId));
	return row?.settings ?? {};
}

/** Titles of the notices of this type already sent about a record. */
export async function sentTitles(tx: Tx, agencyId: string, type: string, referenceId: string) {
	const rows = await tx
		.selectDistinct({ title: notifications.title })
		.from(notifications)
		.where(
			and(
				eq(notifications.agency_id, agencyId),
				eq(notifications.type, type),
				eq(notifications.reference_id, referenceId)
			)
		);
	return rows.map((r) => r.title);
}
