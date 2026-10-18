// Copy a week's assignments to another week (frontend-audit.md finding 17:
// "copy last week"). Each assigned slot goes to the same weekday and shift
// in the target week. Slots there that are already assigned or being
// covered are left alone, and shifts already started are skipped.
import type { ShiftKey } from './shifts';
import { addDays } from './time';

export interface WeekSlot {
	day: string;
	shift: ShiftKey;
	assignedTo: string | null;
	status: string;
}
export type CopySkip = 'already-assigned' | 'finding-cover' | 'started';
export interface CopyPlan {
	copy: { day: string; shift: ShiftKey; profileId: string }[];
	skipped: { day: string; shift: ShiftKey; reason: CopySkip }[];
}

export function planWeekCopy(
	source: WeekSlot[],
	target: WeekSlot[],
	fromWeek: string,
	toWeek: string,
	started: (day: string, shift: ShiftKey) => boolean
): CopyPlan {
	const plan: CopyPlan = { copy: [], skipped: [] };
	const offset = Math.round((Date.parse(toWeek) - Date.parse(fromWeek)) / 86_400_000);
	for (const slot of source) {
		if (!slot.assignedTo) continue;
		const day = addDays(slot.day, offset);
		const existing = target.find((t) => t.day === day && t.shift === slot.shift);
		const reason: CopySkip | null = started(day, slot.shift)
			? 'started'
			: existing?.assignedTo
				? 'already-assigned'
				: existing?.status === 'filling'
					? 'finding-cover'
					: null;
		if (reason) plan.skipped.push({ day, shift: slot.shift, reason });
		else plan.copy.push({ day, shift: slot.shift, profileId: slot.assignedTo });
	}
	return plan;
}
