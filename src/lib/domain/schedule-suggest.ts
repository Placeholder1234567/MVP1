// Suggested staff for a week's open shifts (frontend-audit.md finding 17,
// fix 2). The same checks as coverage offers (eligibility.ts), applied shift
// by shift: each suggestion counts as that person working that day and adds
// to their week, so suggestions never double-book anyone or push them past
// 40 hours. Among eligible staff the one with the fewest shifts that week is
// suggested, to spread the work. Only suggestions: a supervisor applies them.
import { eligibility, type Candidate, type Reason } from './eligibility';
import type { ShiftKey } from './shifts';

export interface OpenShift {
	day: string;
	shift: ShiftKey;
	/** Scheduled dose times at the home that day (med-certified staff needed) */
	doseTimes: string[];
}
export interface Suggestion {
	day: string;
	shift: ShiftKey;
	profileId: string | null;
	/** Why nobody fits, when profileId is null: the most common reason */
	reason: Reason | null;
}

export function suggestShifts(
	open: readonly OpenShift[],
	staff: readonly Candidate[],
	/** Assignments already in the week, any home */
	scheduled: readonly { profileId: string | null; day: string }[],
	homeId: string
): Suggestion[] {
	const weekly = new Map<string, number>();
	const working = new Map<string, Set<string>>();
	const add = (profileId: string, day: string) => {
		weekly.set(profileId, (weekly.get(profileId) ?? 0) + 1);
		const set = working.get(day) ?? new Set<string>();
		set.add(profileId);
		working.set(day, set);
	};
	for (const s of scheduled) if (s.profileId) add(s.profileId, s.day);
	const order = (s: OpenShift) => `${s.day}:${['am', 'pm', 'on'].indexOf(s.shift)}`;
	return [...open]
		.sort((a, b) => order(a).localeCompare(order(b)))
		.map((slot) => {
			const results = eligibility([...staff], {
				homeId,
				shift: slot.shift,
				doseTimes: slot.doseTimes,
				workingThatDay: working.get(slot.day) ?? new Set(),
				weeklyShifts: weekly
			});
			const pick = results
				.filter((r) => r.eligible)
				.sort(
					(a, b) => (weekly.get(a.id) ?? 0) - (weekly.get(b.id) ?? 0) || a.id.localeCompare(b.id)
				)[0];
			if (pick) {
				add(pick.id, slot.day);
				return { day: slot.day, shift: slot.shift, profileId: pick.id, reason: null };
			}
			const counts = new Map<Reason, number>();
			for (const r of results)
				if (r.reason && r.reason !== 'inactive' && r.reason !== 'not_trained_at_home')
					counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
			const reason =
				[...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'not_trained_at_home';
			return { day: slot.day, shift: slot.shift, profileId: null, reason };
		});
}
