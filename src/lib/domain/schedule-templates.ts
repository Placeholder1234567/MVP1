// Schedule templates (frontend-audit.md finding 17): a home's usual week,
// stored by weekday (0 = the week's first day) so it applies to any week.
import type { ShiftKey } from './shifts';
import type { WeekSlot } from './schedule-copy';
import { addDays } from './time';

export interface TemplateSlot {
	weekday: number;
	shift: ShiftKey;
	profileId: string;
}
export const TEMPLATE_NAME_MAX = 60;
export const TEMPLATES_PER_HOME_MAX = 20;
const SHIFT_KEYS: readonly ShiftKey[] = ['am', 'pm', 'on'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The assigned shifts of a week, by weekday. */
export function templateFromWeek(
	slots: readonly { day: string; shift: ShiftKey; assignedTo: string | null }[],
	weekStart: string
): TemplateSlot[] {
	const out: TemplateSlot[] = [];
	for (let weekday = 0; weekday < 7; weekday++) {
		const day = addDays(weekStart, weekday);
		for (const shift of SHIFT_KEYS) {
			const slot = slots.find((s) => s.day === day && s.shift === shift && s.assignedTo);
			if (slot?.assignedTo) out.push({ weekday, shift, profileId: slot.assignedTo });
		}
	}
	return out;
}

/** A template laid onto a week, ready for planWeekCopy() with the same week as source and target. */
export function templateToWeek(template: readonly TemplateSlot[], weekStart: string): WeekSlot[] {
	return template.map((t) => ({
		day: addDays(weekStart, t.weekday),
		shift: t.shift,
		assignedTo: t.profileId,
		status: 'filled'
	}));
}

/** Stored slots, keeping only well-formed ones (one per weekday and shift). */
export function parseTemplateSlots(value: unknown): TemplateSlot[] {
	const list = Array.isArray(value) ? value : [];
	const seen = new Set<string>();
	const out: TemplateSlot[] = [];
	for (const raw of list) {
		if (!raw || typeof raw !== 'object') continue;
		const { weekday, shift, profileId } = raw as Record<string, unknown>;
		if (
			!Number.isInteger(weekday) ||
			(weekday as number) < 0 ||
			(weekday as number) > 6 ||
			!SHIFT_KEYS.includes(shift as ShiftKey) ||
			typeof profileId !== 'string' ||
			!UUID.test(profileId)
		)
			continue;
		const key = `${weekday}:${shift}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ weekday: weekday as number, shift: shift as ShiftKey, profileId });
	}
	return out;
}
