import { z } from 'zod';
import { channelsFor, NOTIFICATION_TYPES, type Preference } from '../../../domain/index.ts';
import { asService, type Tx } from '../../db';
import type { CurrentUser } from '../auth/index.ts';
import { ServiceError } from '../../errors';
import { carrierPhone, ensureCarrierState, recordCarrierConsent } from './carrier-consent.queries';
import {
	inboxItem,
	listInbox,
	lockPreferences,
	markInboxRead,
	savePreference
} from './inbox.queries';

export async function getNotification(tx: Tx, agencyId: string, profileId: string, id: string) {
	const row = await inboxItem(tx, agencyId, profileId, id);
	if (!row) throw new ServiceError('NOT_FOUND', 'Alert not found');
	return row;
}

export const PreferenceInput = z.object({
	notificationType: z.enum(NOTIFICATION_TYPES),
	pushEnabled: z.boolean().optional(),
	smsEnabled: z.boolean().optional(),
	emailEnabled: z.boolean().optional()
});
export const PreferencesInput = z
	.array(PreferenceInput)
	.min(1)
	.max(NOTIFICATION_TYPES.length)
	.refine(
		(rows) => new Set(rows.map((r) => r.notificationType)).size === rows.length,
		'Choose each notification type once'
	);
export function listNotifications(
	tx: Tx,
	agencyId: string,
	profileId: string,
	input: Parameters<typeof listInbox>[3]
) {
	return listInbox(tx, agencyId, profileId, input);
}
export async function markNotificationsRead(
	tx: Tx,
	agencyId: string,
	profileId: string,
	ids: string[]
) {
	return {
		updated: await markInboxRead(
			tx,
			agencyId,
			profileId,
			z.array(z.uuid()).min(1).max(100).parse(ids)
		)
	};
}
export async function updatePreferences(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	input: z.infer<typeof PreferencesInput>
) {
	const rows = PreferencesInput.parse(input);
	const saved = await lockPreferences(tx, agencyId, user.profileId);
	await asService(tx, async (service) => {
		const phone = await carrierPhone(service, agencyId, user.profileId);
		if (phone) await ensureCarrierState(service, agencyId, phone);
	});
	for (const row of rows) {
		const previous = saved.find((r) => r.notification_type === row.notificationType);
		const defaults = channelsFor(row.notificationType, user.role);
		const preference: Preference = {
			push: row.pushEnabled ?? previous?.push_enabled ?? defaults.includes('push'),
			sms: row.smsEnabled ?? previous?.sms_enabled ?? defaults.includes('sms'),
			email: row.emailEnabled ?? previous?.email_enabled ?? defaults.includes('email')
		};
		// Normalize mandatory channels rather than storing an opt-out that delivery ignores.
		const effective = channelsFor(row.notificationType, user.role, preference);
		await savePreference(tx, {
			agency_id: agencyId,
			profile_id: user.profileId,
			notification_type: row.notificationType,
			push_enabled: effective.includes('push'),
			sms_enabled: effective.includes('sms'),
			email_enabled: effective.includes('email')
		});
	}
	return { updated: rows.length };
}

/**
 * Texting STOP turns SMS off for every type, mandatory ones included: carriers
 * block messages to opted-out numbers, and dispatch skips SMS when the saved
 * preference says no (notifications.md §6 "Opt-Out"). START restores each
 * type's role default. Push and email keep their saved or default values.
 * Runs as app_service, since the sender has no session.
 */
export async function setSmsOptOut(
	tx: Tx,
	agencyId: string,
	profile: { id: string; role: CurrentUser['role'] },
	optedOut: boolean,
	expectedPhone?: string
) {
	const saved = await lockPreferences(tx, agencyId, profile.id);
	const phone = await carrierPhone(tx, agencyId, profile.id);
	if (expectedPhone !== undefined && phone !== expectedPhone)
		throw new ServiceError('RULE_VIOLATION', 'SMS recipient changed');
	if (phone) await recordCarrierConsent(tx, agencyId, phone, optedOut);
	for (const type of NOTIFICATION_TYPES) {
		const previous = saved.find((r) => r.notification_type === type);
		const defaults = channelsFor(type, profile.role);
		await savePreference(tx, {
			agency_id: agencyId,
			profile_id: profile.id,
			notification_type: type,
			push_enabled: previous?.push_enabled ?? defaults.includes('push'),
			sms_enabled: !optedOut && defaults.includes('sms'),
			email_enabled: previous?.email_enabled ?? defaults.includes('email')
		});
	}
}
