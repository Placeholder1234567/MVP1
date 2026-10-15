import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import type { Tx } from '../../db';
import { notifications, notificationPreferences, profiles } from '../../db/schema';

const view = {
	id: notifications.id,
	type: notifications.type,
	title: notifications.title,
	body: notifications.body,
	channel: notifications.channel,
	status: notifications.status,
	sentAt: notifications.sent_at,
	readAt: notifications.read_at,
	referenceId: notifications.reference_id,
	referenceType: notifications.reference_type,
	createdAt: notifications.created_at
};
export async function inboxItem(tx: Tx, agencyId: string, profileId: string, id: string) {
	return (
		await tx
			.select(view)
			.from(notifications)
			.where(
				and(
					eq(notifications.agency_id, agencyId),
					eq(notifications.profile_id, profileId),
					eq(notifications.id, id)
				)
			)
	)[0];
}

export function listInbox(
	tx: Tx,
	agencyId: string,
	profileId: string,
	input: {
		unreadOnly?: boolean;
		channel?: 'in_app' | 'push' | 'sms' | 'email';
		limit: number;
		offset: number;
	}
) {
	return tx
		.select(view)
		.from(notifications)
		.where(
			and(
				eq(notifications.agency_id, agencyId),
				eq(notifications.profile_id, profileId),
				input.unreadOnly ? isNull(notifications.read_at) : undefined,
				input.channel ? eq(notifications.channel, input.channel) : undefined
			)
		)
		.orderBy(desc(notifications.created_at), notifications.id)
		.limit(input.limit)
		.offset(input.offset);
}

export async function markInboxRead(tx: Tx, agencyId: string, profileId: string, ids: string[]) {
	const own = and(eq(notifications.agency_id, agencyId), eq(notifications.profile_id, profileId));
	const selected = await tx
		.select({
			id: notifications.id,
			type: notifications.type,
			reference: notifications.reference_id
		})
		.from(notifications)
		.where(and(own, inArray(notifications.id, ids)));
	if (!selected.length) return 0;
	// Acknowledgment covers all channels for this event; escalation checks any row.
	const groups = selected.map((r) =>
		r.reference
			? and(eq(notifications.type, r.type), eq(notifications.reference_id, r.reference))
			: eq(notifications.id, r.id)
	);
	return (
		await tx
			.update(notifications)
			.set({ read_at: new Date(), updated_at: new Date() })
			.where(and(own, isNull(notifications.read_at), or(...groups)))
			.returning({ id: notifications.id })
	).length;
}

export async function lockPreferences(tx: Tx, agencyId: string, profileId: string) {
	await tx
		.select({ id: profiles.id })
		.from(profiles)
		.where(and(eq(profiles.agency_id, agencyId), eq(profiles.id, profileId)))
		.for('update');
	return tx
		.select()
		.from(notificationPreferences)
		.where(
			and(
				eq(notificationPreferences.agency_id, agencyId),
				eq(notificationPreferences.profile_id, profileId)
			)
		);
}
export async function savePreference(tx: Tx, data: typeof notificationPreferences.$inferInsert) {
	await tx
		.insert(notificationPreferences)
		.values(data)
		.onConflictDoUpdate({
			target: [notificationPreferences.profile_id, notificationPreferences.notification_type],
			set: {
				push_enabled: data.push_enabled,
				sms_enabled: data.sms_enabled,
				email_enabled: data.email_enabled,
				updated_at: new Date()
			}
		});
}
