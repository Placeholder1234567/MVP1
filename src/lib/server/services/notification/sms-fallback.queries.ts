import { and, eq, isNull } from 'drizzle-orm';
import type { Tx } from '../../db';
import { notifications, notificationPreferences, profiles } from '../../db/schema';
import { channelsFor, needsSmsPushFallback, type StaffRole } from '../../../domain/notifications';
import { smsFallbackId } from './sms-fallback-id';

/** Serialize fallback decisions per recipient, including two SMS rows for the same event. */
export async function createSmsPushFallback(
	tx: Tx,
	agencyId: string,
	smsId: string
): Promise<string | null> {
	const sourceScope = and(
		eq(notifications.agency_id, agencyId),
		eq(notifications.id, smsId),
		eq(notifications.channel, 'sms')
	);
	const [identity] = await tx
		.select({ profileId: notifications.profile_id })
		.from(notifications)
		.where(sourceScope);
	if (!identity) return null;
	const [recipient] = await tx
		.select({ active: profiles.active, role: profiles.role })
		.from(profiles)
		.where(and(eq(profiles.agency_id, agencyId), eq(profiles.id, identity.profileId)))
		// Serializes per recipient without blocking foreign-key checks on the profile.
		.for('no key update');
	if (!recipient) return null;
	const [source] = await tx.select().from(notifications).where(sourceScope);
	if (!source) return null;
	const [preference] = await tx
		.select({
			push: notificationPreferences.push_enabled,
			sms: notificationPreferences.sms_enabled,
			email: notificationPreferences.email_enabled
		})
		.from(notificationPreferences)
		.where(
			and(
				eq(notificationPreferences.agency_id, agencyId),
				eq(notificationPreferences.profile_id, source.profile_id),
				eq(notificationPreferences.notification_type, source.type)
			)
		);
	if (
		!needsSmsPushFallback({
			priority: source.priority,
			status: source.status,
			active: recipient.active,
			acknowledged: !!source.read_at,
			pushAllowed: channelsFor(source.type, recipient.role as StaffRole, preference).includes(
				'push'
			)
		})
	)
		return null;
	if (source.reference_id) {
		const related = await tx
			.select({
				channel: notifications.channel,
				status: notifications.status,
				readAt: notifications.read_at
			})
			.from(notifications)
			.where(
				and(
					eq(notifications.agency_id, agencyId),
					eq(notifications.profile_id, source.profile_id),
					eq(notifications.type, source.type),
					eq(notifications.reference_id, source.reference_id),
					source.reference_type
						? eq(notifications.reference_type, source.reference_type)
						: isNull(notifications.reference_type)
				)
			);
		// Acknowledgment stops delivery assurance; an existing live push already covers this event.
		if (
			related.some(
				(row) =>
					row.readAt ||
					(row.channel === 'push' && row.status !== 'failed' && row.status !== 'rate_limited')
			)
		)
			return null;
	}
	const id = smsFallbackId(source.id);
	const [inserted] = await tx
		.insert(notifications)
		.values({
			id,
			agency_id: agencyId,
			profile_id: source.profile_id,
			type: source.type,
			title: 'Urgent update requires review',
			channel: 'push',
			priority: 1,
			reference_id: source.reference_id,
			reference_type: source.reference_type
		})
		.onConflictDoNothing({ target: notifications.id })
		.returning({ id: notifications.id });
	return inserted?.id ?? null;
}
