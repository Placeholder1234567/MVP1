// Notification Service (services.md, notifications.md). This first slice only
// creates the in-app notification rows, which reach devices through sync.
// Push, SMS and email delivery are Cloud Tasks jobs added later; the rows are
// created with status 'pending' so those jobs can pick them up.
//
// Runs as app_service inside the caller's transaction: notifying other users
// is a cross-user write clients can't make themselves (rls.sql), and it must
// roll back with the change that caused it.
import { asService, type Tx } from '../../db';
import { activeStaffByRole, insertNotifications } from './notification.queries';

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

/**
 * Notifies the supervisors assigned to a home, or the agency's admins if the
 * home has no supervisor. Returns how many people were notified.
 */
export function notifyHomeSupervisors(
	tx: Tx,
	agencyId: string,
	homeId: string | null,
	n: NotificationInput
): Promise<number> {
	return asService(tx, async (tx) => {
		let to = await activeStaffByRole(tx, agencyId, 'supervisor', homeId);
		if (!to.length) to = await activeStaffByRole(tx, agencyId, 'admin');
		await insertNotifications(
			tx,
			to.map((p) => ({
				agency_id: agencyId,
				profile_id: p.id,
				type: n.type,
				priority: n.priority,
				title: n.title,
				body: n.body,
				channel: 'in_app',
				reference_id: n.referenceId,
				reference_type: n.referenceType
			}))
		);
		return to.length;
	});
}
