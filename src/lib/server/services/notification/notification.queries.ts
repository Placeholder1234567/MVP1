import { and, arrayContains, count, eq, gte, inArray, lt, lte, ne, or } from 'drizzle-orm';
import type { Tx } from '../../db';
import {
	agencies,
	coverageOfferEvidence,
	coverageRequests,
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

export type CoverageOfferEvidenceEvent =
	'queued' | 'provider_accepted' | 'delivery_reported' | 'failed' | 'suppressed' | 'rate_limited';

/**
 * Appends narrowly scoped coverage-offer evidence for notifications that
 * actually reference a coverage request. The notification row supplies every
 * identity and scope field; callers cannot forge an agency, home or recipient.
 * The unique notification/event key makes duplicate queue tasks and provider
 * callbacks idempotent. Existing notification RLS is not changed.
 */
export async function recordCoverageOfferEvidence(
	tx: Tx,
	notificationIds: string | string[],
	event: CoverageOfferEvidenceEvent,
	occurredAt = new Date()
) {
	const ids = Array.isArray(notificationIds) ? notificationIds : [notificationIds];
	if (!ids.length) return;
	const rows = await tx
		.select({
			agencyId: notifications.agency_id,
			homeId: coverageRequests.home_id,
			requestId: coverageRequests.id,
			notificationId: notifications.id,
			recipientProfileId: notifications.profile_id,
			channel: notifications.channel
		})
		.from(notifications)
		.innerJoin(
			coverageRequests,
			and(
				eq(coverageRequests.id, notifications.reference_id),
				eq(coverageRequests.agency_id, notifications.agency_id)
			)
		)
		.where(
			and(
				inArray(notifications.id, ids),
				eq(notifications.type, 'coverage_offer'),
				eq(notifications.reference_type, 'coverage_requests')
			)
		);
	if (!rows.length) return;
	await tx
		.insert(coverageOfferEvidence)
		.values(
			rows.map((row) => ({
				agency_id: row.agencyId,
				home_id: row.homeId,
				coverage_request_id: row.requestId,
				notification_id: row.notificationId,
				recipient_profile_id: row.recipientProfileId,
				channel: row.channel,
				event,
				occurred_at: occurredAt
			}))
		)
		.onConflictDoNothing();
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
	set: {
		status: 'sent' | 'failed' | 'rate_limited';
		providerMessageId?: string;
		evidence?: CoverageOfferEvidenceEvent;
	}
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
	await recordCoverageOfferEvidence(
		tx,
		id,
		set.evidence ??
			(set.status === 'sent'
				? 'provider_accepted'
				: set.status === 'rate_limited'
					? 'rate_limited'
					: 'failed')
	);
}

/**
 * Claims a pending delivery just before it is sent, so two dispatches of the
 * same row (the sweeper and a queue retry, or overlapping sweeps) can't both
 * send it. A claim stamps updated_at; it is free while updated_at is still
 * its creation time, or once the claim is older than `lease` (a dispatch that
 * crashed mid-send). Concurrent claims serialize on the row: the second sees
 * the first's stamp and gets nothing. Returns whether this dispatch has it.
 */
export async function claimDelivery(tx: Tx, id: string, lease: number) {
	const now = new Date();
	const [row] = await tx
		.select({ createdAt: notifications.created_at })
		.from(notifications)
		.where(and(eq(notifications.id, id), eq(notifications.status, 'pending')));
	if (!row) return false;
	const claimed = await tx
		.update(notifications)
		// Postgres keeps microseconds; a JS Date can round back to/before created_at,
		// leaving a fresh claim eligible for a concurrent dispatcher. Always advance
		// beyond creation, even when clocks differ or both operations share a tick.
		.set({ updated_at: new Date(Math.max(now.getTime(), row.createdAt.getTime() + 1)) })
		.where(
			and(
				eq(notifications.id, id),
				eq(notifications.status, 'pending'),
				or(
					lte(notifications.updated_at, notifications.created_at),
					lt(notifications.updated_at, new Date(now.getTime() - lease))
				)
			)
		)
		.returning({ id: notifications.id });
	return claimed.length > 0;
}

/** Gives a claim back after a send that will be retried, so the retry can claim it at once. */
export async function releaseDelivery(tx: Tx, id: string) {
	await tx
		.update(notifications)
		.set({ updated_at: notifications.created_at })
		.where(and(eq(notifications.id, id), eq(notifications.status, 'pending')));
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
