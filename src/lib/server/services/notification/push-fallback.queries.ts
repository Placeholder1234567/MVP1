import { and, eq } from 'drizzle-orm';
import type { Tx } from '../../db';
import { notifications, notificationPreferences, profiles } from '../../db/schema';
import { needsPushSmsFallback } from '../../../domain/notifications';
import { pushFallbackId } from './sms-fallback-id';
import { carrierOptOut } from './carrier-consent.queries';

/**
 * The SMS for a mandatory alert whose push failed for good, or null when none
 * is needed. Only for alerts about a record (all mandatory types are), so the
 * event can be checked: nothing is sent once anyone acknowledged it, or when
 * the person already has a text for it (their default channels, or an
 * earlier fallback), which also stops push and SMS fallbacks feeding each
 * other. The recipient row is locked, as for the SMS-to-push fallback.
 */
export async function createPushSmsFallback(
	tx: Tx,
	agencyId: string,
	pushId: string
): Promise<string | null> {
	const scope = and(
		eq(notifications.agency_id, agencyId),
		eq(notifications.id, pushId),
		eq(notifications.channel, 'push')
	);
	const [identity] = await tx
		.select({ profileId: notifications.profile_id })
		.from(notifications)
		.where(scope);
	if (!identity) return null;
	const [recipient] = await tx
		.select({ active: profiles.active, phone: profiles.phone })
		.from(profiles)
		.where(and(eq(profiles.agency_id, agencyId), eq(profiles.id, identity.profileId)))
		.for('update');
	if (!recipient) return null;
	if (recipient.phone && (await carrierOptOut(tx, agencyId, recipient.phone))) return null;
	const [source] = await tx.select().from(notifications).where(scope);
	if (!source?.reference_id) return null;
	const [preference] = await tx
		.select({ sms: notificationPreferences.sms_enabled })
		.from(notificationPreferences)
		.where(
			and(
				eq(notificationPreferences.agency_id, agencyId),
				eq(notificationPreferences.profile_id, source.profile_id),
				eq(notificationPreferences.notification_type, source.type)
			)
		);
	if (
		!needsPushSmsFallback({
			type: source.type,
			status: source.status,
			active: recipient.active,
			acknowledged: !!source.read_at,
			hasPhone: !!recipient.phone,
			smsPreference: preference?.sms
		})
	)
		return null;
	const related = await tx
		.select({ channel: notifications.channel, readAt: notifications.read_at })
		.from(notifications)
		.where(
			and(
				eq(notifications.agency_id, agencyId),
				eq(notifications.profile_id, source.profile_id),
				eq(notifications.type, source.type),
				eq(notifications.reference_id, source.reference_id)
			)
		);
	if (related.some((r) => r.readAt || r.channel === 'sms')) return null;
	const [inserted] = await tx
		.insert(notifications)
		.values({
			id: pushFallbackId(source.id),
			agency_id: agencyId,
			profile_id: source.profile_id,
			type: source.type,
			title: source.title,
			channel: 'sms',
			priority: source.priority,
			reference_id: source.reference_id,
			reference_type: source.reference_type
		})
		.onConflictDoNothing({ target: notifications.id })
		.returning({ id: notifications.id });
	return inserted?.id ?? null;
}
