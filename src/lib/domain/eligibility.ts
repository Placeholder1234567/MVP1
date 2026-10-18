import { SHIFT_HOURS, shiftForTime, type ShiftKey } from './shifts';

export const MAX_WEEKLY_HOURS = 40;

export interface Candidate {
	id: string;
	home_ids: string[];
	med_certified: boolean;
	active: boolean;
}

export interface EligibilityInput {
	homeId: string;
	shift: ShiftKey;
	/** Person who called out, never offered their own shift */
	excludeId?: string | null;
	/** Dose times (HH:MM) scheduled at this home that day */
	doseTimes: string[];
	/** Staff already scheduled anywhere that day */
	workingThatDay: Set<string>;
	/** Shifts each person already has in that Sunday-Saturday week */
	weeklyShifts: Map<string, number>;
}

export type Reason =
	| 'called_out'
	| 'inactive'
	| 'not_trained_at_home'
	| 'already_working'
	| 'over_40_hours'
	| 'not_med_certified';

/** Why someone wasn't offered a shift, for the coverage activity log. */
export const ELIGIBILITY_REASON_LABEL: Record<Reason, string> = {
	called_out: 'Called out of this shift',
	inactive: 'Not active',
	not_trained_at_home: 'Not assigned to this home',
	already_working: 'Already working that day',
	over_40_hours: 'Would go over 40 hours that week',
	not_med_certified: 'Medications due; not med-certified'
};

export interface Eligibility {
	id: string;
	eligible: boolean;
	reason: Reason | null;
}

/** True when a scheduled dose falls inside the shift. */
export function medsDueDuring(shift: ShiftKey, doseTimes: string[]): boolean {
	return doseTimes.some((t) => shiftForTime(t) === shift);
}

/**
 * Who can be offered an open shift. Same checks, in the same order, as the
 * MVP's eligibility() in mvp/src/app-core.js, with one change: the MVP treats
 * meds as due only on the evening shift; here meds are due when a scheduled
 * dose time falls inside the shift.
 */
export function eligibility(staff: Candidate[], input: EligibilityInput): Eligibility[] {
	const needsMeds = medsDueDuring(input.shift, input.doseTimes);
	return staff.map((p) => {
		let reason: Reason | null = null;
		if (p.id === input.excludeId) reason = 'called_out';
		else if (!p.active) reason = 'inactive';
		else if (!p.home_ids.includes(input.homeId)) reason = 'not_trained_at_home';
		else if (input.workingThatDay.has(p.id)) reason = 'already_working';
		else if (((input.weeklyShifts.get(p.id) ?? 0) + 1) * SHIFT_HOURS > MAX_WEEKLY_HOURS)
			reason = 'over_40_hours';
		else if (needsMeds && !p.med_certified) reason = 'not_med_certified';
		return { id: p.id, eligible: reason == null, reason };
	});
}
