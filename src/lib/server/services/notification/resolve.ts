// Ends alerts whose subject was handled some other way than opening the alert.
import { asService, type Tx } from '../../db';
import { markEventsHandled } from './inbox.queries';

/**
 * A reviewed incident no longer needs its review alerts: the 48 and 72 hour
 * escalation texts (notifications.md §2.12) stop. Contact-overdue reminders
 * are separate and keep going until the contact is marked told.
 */
export const incidentReviewed = (tx: Tx, agencyId: string, incidentId: string) =>
	asService(tx, (t) =>
		markEventsHandled(t, agencyId, incidentId, [
			'incident_reported',
			'incident_high_severity',
			'incident_review_needed'
		])
	);
