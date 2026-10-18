import { and, eq } from 'drizzle-orm';
import type { Tx } from '../../db';
import { agencies, notifications, profiles } from '../../db/schema';

export function agencyTimezone(tx: Tx, agencyId: string) {
	return tx
		.select({ timezone: agencies.timezone })
		.from(agencies)
		.where(eq(agencies.id, agencyId))
		.then((r) => r[0]?.timezone);
}

export function activeStaff(tx: Tx, agencyId: string) {
	return tx
		.select({ id: profiles.id, role: profiles.role })
		.from(profiles)
		.where(and(eq(profiles.agency_id, agencyId), eq(profiles.active, true)));
}

/** True if this announcement was already sent (a double submit or retry). */
export async function announced(tx: Tx, agencyId: string, announcementId: string) {
	const [row] = await tx
		.select({ id: notifications.id })
		.from(notifications)
		.where(
			and(
				eq(notifications.agency_id, agencyId),
				eq(notifications.type, 'system_maintenance'),
				eq(notifications.reference_id, announcementId)
			)
		)
		.limit(1);
	return Boolean(row);
}
