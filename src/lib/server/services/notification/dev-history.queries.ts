import { and, desc, eq } from 'drizzle-orm';
import type { Tx } from '../../db';
import { notifications, profiles } from '../../db/schema';

/** Caller authorization and the synthetic development guard are enforced by the dedicated router. */
export function developmentHistory(tx: Tx, agencyId: string, profileId?: string) {
	return tx
		.select({
			id: notifications.id,
			profileId: notifications.profile_id,
			profileName: profiles.name,
			type: notifications.type,
			title: notifications.title,
			body: notifications.body,
			channel: notifications.channel,
			status: notifications.status,
			createdAt: notifications.created_at
		})
		.from(notifications)
		.innerJoin(
			profiles,
			and(eq(profiles.id, notifications.profile_id), eq(profiles.agency_id, agencyId))
		)
		.where(
			and(
				eq(notifications.agency_id, agencyId),
				profileId ? eq(notifications.profile_id, profileId) : undefined
			)
		)
		.orderBy(desc(notifications.created_at), notifications.id)
		.limit(50);
}
