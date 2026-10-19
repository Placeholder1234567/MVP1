import { and, count, eq, gte, inArray } from 'drizzle-orm';
import type { Tx } from '../../db';
import { notificationPreferences, notifications, profiles } from '../../db/schema';

/** Deliveries sent since `from`, by channel (read as an admin: RLS shows the agency's rows). */
export function sentByChannel(tx: Tx, agencyId: string, from: Date) {
	return tx
		.select({ channel: notifications.channel, n: count() })
		.from(notifications)
		.where(
			and(
				eq(notifications.agency_id, agencyId),
				inArray(notifications.channel, ['sms', 'email', 'push']),
				inArray(notifications.status, ['sent', 'read', 'escalated', 'escalation_exhausted']),
				gte(notifications.created_at, from)
			)
		)
		.groupBy(notifications.channel);
}

/** Each active staff member's text preferences (any type). */
export function smsPreferences(tx: Tx, agencyId: string) {
	return tx
		.select({
			profileId: profiles.id,
			name: profiles.name,
			smsEnabled: notificationPreferences.sms_enabled
		})
		.from(notificationPreferences)
		.innerJoin(profiles, eq(profiles.id, notificationPreferences.profile_id))
		.where(and(eq(notificationPreferences.agency_id, agencyId), eq(profiles.active, true)));
}
