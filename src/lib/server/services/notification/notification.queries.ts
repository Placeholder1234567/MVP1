import { and, arrayContains, count, eq, gte, inArray, lt, ne } from 'drizzle-orm';
import type { Tx } from '../../db';
import {
	agencies,
	deviceTokens,
	notificationPreferences,
	notifications,
	profiles,
	userSettings
} from '../../db/schema';

export async function activeStaffByRole(
	tx: Tx,
	agencyId: string,
	role: 'supervisor' | 'admin',
	homeId?: string | null
) {
	const where = [
		eq(profiles.agency_id, agencyId),
		eq(profiles.active, true),
		eq(profiles.role, role)
	];
	if (homeId) where.push(arrayContains(profiles.home_ids, [homeId]));
	return tx
		.select({ id: profiles.id, role: profiles.role })
		.from(profiles)
		.where(and(...where));
}

export function preferencesFor(tx: Tx, profileIds: string[], type: string) {
	if (!profileIds.length) return Promise.resolve([]);
	return tx
		.select({
			profileId: notificationPreferences.profile_id,
			push: notificationPreferences.push_enabled,
			sms: notificationPreferences.sms_enabled,
			email: notificationPreferences.email_enabled
		})
		.from(notificationPreferences)
		.where(
			and(
				inArray(notificationPreferences.profile_id, profileIds),
				eq(notificationPreferences.notification_type, type)
			)
		);
}

export async function insertNotifications(tx: Tx, rows: (typeof notifications.$inferInsert)[]) {
	if (!rows.length) return [];
	return tx.insert(notifications).values(rows).returning({
		id: notifications.id,
		channel: notifications.channel
	});
}

export async function agencyNotificationSettings(tx: Tx, agencyId: string) {
	const [agency] = await tx
		.select({ settings: agencies.settings })
		.from(agencies)
		.where(eq(agencies.id, agencyId));
	return agency?.settings;
}

/** Pending deliveries (not the in-app rows), with what's needed to send them. */
export function pendingDeliveries(tx: Tx, ids?: string[]) {
	const where = [eq(notifications.status, 'pending'), ne(notifications.channel, 'in_app')];
	if (ids) where.push(inArray(notifications.id, ids));
	return tx
		.select({
			id: notifications.id,
			agencyId: notifications.agency_id,
			channel: notifications.channel,
			type: notifications.type,
			title: notifications.title,
			body: notifications.body,
			referenceId: notifications.reference_id,
			priority: notifications.priority,
			profileId: notifications.profile_id,
			email: profiles.email,
			phone: profiles.phone,
			active: profiles.active,
			timeZone: agencies.timezone,
			agencySettings: agencies.settings,
			quietStart: userSettings.quiet_hours_start,
			quietEnd: userSettings.quiet_hours_end,
			/** false after the person texted STOP (sms-inbound), even for mandatory types */
			smsEnabled: notificationPreferences.sms_enabled
		})
		.from(notifications)
		.innerJoin(profiles, eq(profiles.id, notifications.profile_id))
		.innerJoin(agencies, eq(agencies.id, notifications.agency_id))
		.leftJoin(userSettings, eq(userSettings.profile_id, notifications.profile_id))
		.leftJoin(
			notificationPreferences,
			and(
				eq(notificationPreferences.profile_id, notifications.profile_id),
				eq(notificationPreferences.notification_type, notifications.type)
			)
		)
		.where(and(...where))
		.limit(500);
}

export function pushTokens(tx: Tx, profileId: string) {
	return tx
		.select({ token: deviceTokens.token })
		.from(deviceTokens)
		.where(eq(deviceTokens.profile_id, profileId));
}

/** How many deliveries on this channel went out to the person since `since` (rate limits). */
export async function sentSince(tx: Tx, profileId: string, channel: string, since: Date) {
	const [row] = await tx
		.select({ n: count() })
		.from(notifications)
		.where(
			and(
				eq(notifications.profile_id, profileId),
				eq(notifications.channel, channel),
				gte(notifications.created_at, since),
				inArray(notifications.status, ['sent', 'read', 'escalated', 'escalation_exhausted'])
			)
		);
	return row?.n ?? 0;
}

export async function markDelivery(
	tx: Tx,
	id: string,
	set: { status: 'sent' | 'failed' | 'rate_limited'; providerMessageId?: string }
) {
	await tx
		.update(notifications)
		.set({
			status: set.status,
			sent_at: set.status === 'sent' ? new Date() : null,
			provider_message_id: set.providerMessageId ?? null,
			updated_at: new Date()
		})
		.where(eq(notifications.id, id));
}

/** Deliveries still pending after `olderThan` (the sweeper's safety net). */
export function stalePending(tx: Tx, olderThan: Date) {
	return tx
		.select({ id: notifications.id, channel: notifications.channel })
		.from(notifications)
		.where(
			and(
				eq(notifications.status, 'pending'),
				ne(notifications.channel, 'in_app'),
				lt(notifications.created_at, olderThan)
			)
		)
		.limit(500);
}
