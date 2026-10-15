// Notification Service (services.md, notifications.md).
//
// notify() writes one in-app row per recipient (delivered by sync) plus one
// pending row per delivery channel chosen by channelsFor() (role defaults,
// saved preferences, mandatory types). After the transaction commits, a
// notifications-dispatch job sends the pending rows; a sweeper job retries
// any that are left (jobs/handlers/notifications.ts).
//
// Writes run as app_service inside the caller's transaction: notifying other
// users is a cross-user write clients can't make (rls.sql), and it must roll
// back with the change that caused it.
import { channelsFor, type StaffRole } from '../../../domain/index.ts';
import { afterCommit, asService, type Tx } from '../../db';
import { enqueue } from '../../jobs/queue.ts';
import { activeStaffByRole, insertNotifications, preferencesFor } from './notification.queries';

export { dispatchNotifications, sweepNotifications } from './dispatch';

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

/** Notifies the given people. Returns how many deliveries were queued. */
export function notify(
	tx: Tx,
	agencyId: string,
	recipients: Recipient[],
	n: NotificationInput
): Promise<number> {
	return asService(tx, async (tx) => {
		if (!recipients.length) return 0;
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
			...channelsFor(n.type, r.role, prefs.get(r.id)).map((channel) => ({
				...base,
				profile_id: r.id,
				channel
			}))
		]);
		const inserted = await insertNotifications(tx, rows);
		const ids = inserted.filter((r) => r.channel !== 'in_app').map((r) => r.id);
		if (ids.length) afterCommit(() => enqueue('notifications-dispatch', { ids }));
		return ids.length;
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
