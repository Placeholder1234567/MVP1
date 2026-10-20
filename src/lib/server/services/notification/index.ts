// Notification Service (services.md, notifications.md).
//
// notify() writes one in-app row per recipient (delivered by sync) plus one
// pending row per delivery channel chosen by channelsFor() (role defaults,
// saved preferences, mandatory types). After the transaction commits, each
// channel's job (notifications-push / -sms / -email) sends its rows, a sweeper
// retries any that are left, and types with an escalation chain queue their
// first escalation step (escalation.ts).
//
// Writes run as app_service inside the caller's transaction: notifying other
// users is a cross-user write clients can't make (rls.sql), and it must roll
// back with the change that caused it.
import {
	channelsFor,
	notificationOverrides,
	notificationDisabled,
	type StaffRole
} from '../../../domain/index.ts';
import { randomUUID } from 'node:crypto';
import { render } from '../../messaging/templates.ts';
import type { Delivery } from '../../messaging/index.ts';
import { afterCommit, asService, type Tx } from '../../db';
import { queueDeliveries } from './dispatch';
import { queueEscalation } from './escalation';
import {
	activeStaffByRole,
	insertNotifications,
	preferencesFor,
	agencyNotificationSettings
} from './notification.queries';

export { NotificationOverridesInput } from './overrides-input';
export { developmentNotificationHistory } from './dev-history';
export { dispatchNotifications, sweepNotifications, RetryLater } from './dispatch';
export {
	quietHours,
	saveQuietHours,
	QuietHoursInput,
	listPushDevices,
	registerPushDevice,
	removePushDevice,
	forgetPushDevices,
	PushDeviceInput
} from './settings';
export { escalate, type EscalationPayload } from './escalation';
export { sweepDigests, sendDigest } from './digest';
export { sweepMedReminders } from './med-reminders';
export {
	noteSubmitted,
	noteReviewed,
	medRefused,
	controlledCountDiscrepancy,
	controlledCountersignRequest
} from './care-events';
export { sweepCareReminders } from './care-reminders';
export { incidentReviewed } from './resolve';
export { messagingUsage } from './usage';
export { adminAdded, sweepAccessReview } from './access-review';
export {
	announceMaintenance,
	MaintenanceInput,
	platformAgencies,
	platformAnnouncementId
} from './maintenance';
export { handleEmailEvent, handleSmsEvent, type EventOutcome } from './events';
export {
	getNotification,
	listNotifications,
	markNotificationsRead,
	updatePreferences,
	setSmsOptOut,
	PreferencesInput
} from './inbox';

export interface NotificationInput {
	type: string;
	/** 1 urgent, 2 high, 3 normal, 4 low (notifications.md §3) */
	priority: 1 | 2 | 3 | 4;
	/** Shown in the app after sign-in. Still no client names or clinical detail. */
	title: string;
	body?: string;
	referenceId?: string;
	referenceType?: string;
}

export interface Recipient {
	id: string;
	role: StaffRole;
}

export interface NotificationPreview {
	profileId: string;
	channel: 'push' | 'sms' | 'email';
	delivery: Delivery;
}

/** Preview uses the same selection and templates without inserts, jobs or provider calls. */
export function notify(
	tx: Tx,
	agencyId: string,
	recipients: Recipient[],
	n: NotificationInput,
	options: { preview: true }
): Promise<NotificationPreview[]>;
/** Notifies the given people. Returns how many deliveries were queued. */
export function notify(
	tx: Tx,
	agencyId: string,
	recipients: Recipient[],
	n: NotificationInput
): Promise<number>;
export function notify(
	tx: Tx,
	agencyId: string,
	recipients: Recipient[],
	n: NotificationInput,
	options?: { preview: true }
): Promise<number | NotificationPreview[]> {
	return asService(tx, async (tx) => {
		if (!recipients.length) return options?.preview ? [] : 0;
		const overrides = notificationOverrides(await agencyNotificationSettings(tx, agencyId));
		if (notificationDisabled(n.type, overrides)) return options?.preview ? [] : 0;
		const prefs = new Map(
			(
				await preferencesFor(
					tx,
					recipients.map((r) => r.id),
					n.type
				)
			).map((p) => [p.profileId, p])
		);
		const base = {
			agency_id: agencyId,
			type: n.type,
			priority: n.priority,
			title: n.title,
			body: n.body,
			reference_id: n.referenceId,
			reference_type: n.referenceType
		};
		const rows = recipients.flatMap((r) => [
			{
				...base,
				profile_id: r.id,
				channel: 'in_app',
				status: 'sent' as const,
				sent_at: new Date()
			},
			...[
				...new Set([
					...channelsFor(n.type, r.role, prefs.get(r.id)),
					...(n.type === 'daily_summary' && overrides.requireSummaryEmail ? ['email' as const] : [])
				])
			].map((channel) => ({
				...base,
				profile_id: r.id,
				channel
			}))
		]);
		if (options?.preview) {
			return rows.flatMap((row) =>
				row.channel === 'in_app'
					? []
					: [
							{
								profileId: row.profile_id,
								channel: row.channel as NotificationPreview['channel'],
								delivery: render(row.channel as NotificationPreview['channel'], {
									id: randomUUID(),
									title: n.title,
									type: n.type,
									body: n.body,
									referenceId: n.referenceId
								})
							}
						]
			);
		}
		const inserted = await insertNotifications(tx, rows);
		const deliveries = inserted.filter((r) => r.channel !== 'in_app');
		const first = inserted.find((r) => r.channel === 'in_app');
		afterCommit(async () => {
			await queueDeliveries(deliveries);
			if (first)
				await queueEscalation({
					agencyId,
					type: n.type,
					referenceId: n.referenceId ?? null,
					notificationId: first.id,
					step: 1
				});
		});
		return deliveries.length;
	});
}

/**
 * Notifies the supervisors assigned to a home, or the agency's admins if the
 * home has no supervisor. Returns how many deliveries were queued.
 */
export async function notifyHomeSupervisors(
	tx: Tx,
	agencyId: string,
	homeId: string | null,
	n: NotificationInput
): Promise<number> {
	const to = await asService(tx, async (tx) => {
		const supervisors = await activeStaffByRole(tx, agencyId, 'supervisor', homeId);
		return supervisors.length ? supervisors : activeStaffByRole(tx, agencyId, 'admin');
	});
	return notify(tx, agencyId, to as Recipient[], n);
}
