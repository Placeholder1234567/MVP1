// Automated access review (security.md "Access Reviews" → "Automated
// Detection"): accounts that are active but unused, and caregivers whose
// home access no longer matches where they work. Supports the quarterly
// review; nothing here changes anyone's access.

export const DORMANT_DAYS = 90;
export const HOME_UNUSED_DAYS = 30;
const DAY_MS = 86_400_000;

export interface ReviewProfile {
	id: string;
	role: string;
	active: boolean;
	homeIds: string[];
	createdAt: Date;
	lastSignInAt: Date | null;
}

export interface ReviewSlot {
	homeId: string;
	assignedTo: string | null;
	/** YYYY-MM-DD */
	day: string;
}

export interface AccessReview {
	/** Active accounts not signed in for 90+ days (or never, 90+ days after creation) */
	dormant: string[];
	/** Caregivers with homes they had no shift at in the last 30 days, and which homes */
	unusedHomes: { profileId: string; homeIds: string[] }[];
}

/** Whether a profile counts as dormant at `now`. */
export function isDormant(
	p: Pick<ReviewProfile, 'active' | 'createdAt' | 'lastSignInAt'>,
	now: Date
) {
	const since = p.lastSignInAt ?? p.createdAt;
	return p.active && now.getTime() - since.getTime() >= DORMANT_DAYS * DAY_MS;
}

/**
 * The review for one agency. `slots` should cover at least the last 30 days;
 * `today` is the agency's local date. New caregivers (under 30 days) aren't
 * flagged for homes they haven't worked yet.
 */
export function accessReview(
	profiles: readonly ReviewProfile[],
	slots: readonly ReviewSlot[],
	now: Date,
	today: string
): AccessReview {
	const from = new Date(Date.parse(`${today}T00:00:00Z`) - HOME_UNUSED_DAYS * DAY_MS)
		.toISOString()
		.slice(0, 10);
	const worked = new Set(
		slots
			.filter((s) => s.assignedTo && s.day >= from && s.day <= today)
			.map((s) => `${s.assignedTo}|${s.homeId}`)
	);
	const dormant = profiles.filter((p) => isDormant(p, now)).map((p) => p.id);
	const unusedHomes = profiles
		.filter(
			(p) =>
				p.active &&
				p.role === 'caregiver' &&
				now.getTime() - p.createdAt.getTime() >= HOME_UNUSED_DAYS * DAY_MS
		)
		.map((p) => ({
			profileId: p.id,
			homeIds: p.homeIds.filter((h) => !worked.has(`${p.id}|${h}`))
		}))
		.filter((u) => u.homeIds.length > 0);
	return { dormant, unusedHomes };
}

/** The PHI-free alert title for a review with findings, or null when there are none. */
export function accessReviewTitle(review: AccessReview): string | null {
	const parts: string[] = [];
	const n = review.dormant.length;
	if (n) parts.push(`${n} active ${n === 1 ? 'account' : 'accounts'} unused for 90+ days`);
	const c = review.unusedHomes.length;
	if (c)
		parts.push(
			`${c} ${c === 1 ? 'caregiver has' : 'caregivers have'} home access with no shift there in 30 days`
		);
	return parts.length ? `Access review: ${parts.join('; ')}` : null;
}
