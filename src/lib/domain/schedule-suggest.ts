// Suggested staff for a week's open shifts (frontend-audit.md finding 17,
// fix 2). The same checks as coverage offers (eligibility.ts), applied shift
// by shift: each suggestion counts as that person working that day and adds
// to their week, so suggestions never double-book anyone or push them past
// 40 hours. Among eligible staff the one with the fewest shifts that week is
// suggested, to spread the work. Only suggestions: a supervisor applies them.
import {
	eligibility,
	shiftsInWeek,
	workingAround,
	type Assignment,
	type Candidate,
	type Reason
} from './eligibility';
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
	/** Assignments already in the week (and the day either side), any home */
	scheduled: readonly Assignment[],
	homeId: string
): Suggestion[] {
	const booked = [...scheduled];
	const order = (s: OpenShift) => `${s.day}:${['am', 'pm', 'on'].indexOf(s.shift)}`;
	return [...open]
		.sort((a, b) => order(a).localeCompare(order(b)))
		.map((slot) => {
			const weekly = shiftsInWeek(booked, slot.day);
			const results = eligibility([...staff], {
				homeId,
				shift: slot.shift,
				doseTimes: slot.doseTimes,
				workingThatDay: workingAround(booked, slot.day, slot.shift),
				weeklyShifts: weekly
			});
			const pick = results
				.filter((r) => r.eligible)
				.sort(
					(a, b) => (weekly.get(a.id) ?? 0) - (weekly.get(b.id) ?? 0) || a.id.localeCompare(b.id)
				)[0];
			if (pick) {
				booked.push({ profileId: pick.id, day: slot.day, shift: slot.shift });
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

/**
 * Re-checks kept suggestions when they are applied: the week may have changed
 * since they were suggested (someone assigned by hand, or suggestions for
 * another home applied first). Picks are checked in day and shift order, each
 * accepted one counting toward that person's day and week, so applying can
 * never double-book anyone or push them past 40 hours.
 */
export function checkPicks<P extends { day: string; shift: ShiftKey; profileId: string }>(
	picks: readonly P[],
	staff: readonly Candidate[],
	scheduled: readonly Assignment[],
	homeId: string,
	doseTimes: string[]
): { ok: P[]; refused: P[] } {
	const booked = [...scheduled];
	const order = (s: P) => `${s.day}:${['am', 'pm', 'on'].indexOf(s.shift)}`;
	const ok: P[] = [];
	const refused: P[] = [];
	for (const pick of [...picks].sort((a, b) => order(a).localeCompare(order(b)))) {
		const person = staff.find((p) => p.id === pick.profileId);
		const [result] = person
			? eligibility([person], {
					homeId,
					shift: pick.shift,
					doseTimes,
					workingThatDay: workingAround(booked, pick.day, pick.shift),
					weeklyShifts: shiftsInWeek(booked, pick.day)
				})
			: [];
		if (result?.eligible) {
			booked.push({ profileId: pick.profileId, day: pick.day, shift: pick.shift });
			ok.push(pick);
		} else refused.push(pick);
	}
	return { ok, refused };
}
