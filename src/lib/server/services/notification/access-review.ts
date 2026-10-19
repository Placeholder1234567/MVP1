// Automated access review (security.md "Access Reviews" → "Automated
// Detection"), run daily by the access-review-sweep. Admins get one
// access_review alert a week at most, with counts only; the Staff screen
// shows who. A new admin account alerts the other admins straight away.
import {
	accessReview,
	accessReviewTitle,
	addDays,
	HOME_UNUSED_DAYS,
	localTime
} from '../../../domain/index.ts';
import { withService, type Tx } from '../../db';
import { assignedSince, reviewProfiles, reviewSentSince } from './access-review.queries';
import { agencyClocks } from './escalation.queries';
import { notify, type Recipient } from './index';
import { activeStaffByRole } from './notification.queries';

const REPEAT_DAYS = 7;

export async function sweepAccessReview(now = new Date()): Promise<{ alerts: number }> {
	let alerts = 0;
	for (const a of await withService((tx) => agencyClocks(tx))) {
		if (await withService((tx) => reviewAgency(tx, a.id, a.timeZone, now))) alerts++;
	}
	return { alerts };
}

/** Sends the agency's review alert when there are findings and none went out this week. */
export async function reviewAgency(tx: Tx, agencyId: string, timeZone: string, now: Date) {
	if (await reviewSentSince(tx, agencyId, new Date(now.getTime() - REPEAT_DAYS * 86_400_000)))
		return false;
	const today = localTime(now, timeZone).day;
	const [people, slots] = await Promise.all([
		reviewProfiles(tx, agencyId),
		assignedSince(tx, agencyId, addDays(today, -HOME_UNUSED_DAYS))
	]);
	const title = accessReviewTitle(
		accessReview(
			people.map((p) => ({ ...p, homeIds: p.homeIds ?? [] })),
			slots,
			now,
			today
		)
	);
	if (!title) return false;
	const admins = await activeStaffByRole(tx, agencyId, 'admin');
	if (!admins.length) return false;
	await notify(tx, agencyId, admins as Recipient[], {
		type: 'access_review',
		priority: 3,
		title,
		body: 'Open Staff to see who. Deactivate accounts no one uses and remove homes people no longer work at.',
		referenceId: agencyId,
		referenceType: 'agencies'
	});
	return true;
}

/**
 * A new admin account (invited, or promoted): every existing admin, the one
 * who made the change included, gets a record to check it was meant.
 */
export async function adminAdded(tx: Tx, agencyId: string, profileId: string) {
	const admins = (await activeStaffByRole(tx, agencyId, 'admin')).filter((a) => a.id !== profileId);
	await notify(tx, agencyId, admins as Recipient[], {
		type: 'access_review',
		priority: 2,
		title: 'Access review: a new admin account was added',
		body: 'Admins can see and change everything in your agency. Check in Staff that this was meant.',
		referenceId: profileId,
		referenceType: 'profiles'
	});
}
