import { and, eq, gte, isNotNull } from 'drizzle-orm';
import type { Tx } from '../../db';
import { notifications, profiles, scheduleSlots } from '../../db/schema';

/** Every active staff account in the agency, with what the review needs. */
export function reviewProfiles(tx: Tx, agencyId: string) {
	return tx
		.select({
			id: profiles.id,
			role: profiles.role,
			active: profiles.active,
			homeIds: profiles.home_ids,
			createdAt: profiles.created_at,
			lastSignInAt: profiles.last_sign_in_at
		})
		.from(profiles)
		.where(and(eq(profiles.agency_id, agencyId), eq(profiles.active, true)));
}

/** Slots someone was assigned to from `fromDay` (YYYY-MM-DD) on. */
export function assignedSince(tx: Tx, agencyId: string, fromDay: string) {
	return tx
		.select({
			homeId: scheduleSlots.home_id,
			assignedTo: scheduleSlots.assigned_to,
			day: scheduleSlots.day
		})
		.from(scheduleSlots)
		.where(
			and(
				eq(scheduleSlots.agency_id, agencyId),
				gte(scheduleSlots.day, fromDay),
				isNotNull(scheduleSlots.assigned_to)
			)
		);
}

/** Whether the weekly review alert already went out since `since`. */
export async function reviewSentSince(tx: Tx, agencyId: string, since: Date) {
	const [row] = await tx
		.select({ id: notifications.id })
		.from(notifications)
		.where(
			and(
				eq(notifications.agency_id, agencyId),
				eq(notifications.type, 'access_review'),
				eq(notifications.reference_type, 'agencies'),
				gte(notifications.created_at, since)
			)
		)
		.limit(1);
	return Boolean(row);
}
