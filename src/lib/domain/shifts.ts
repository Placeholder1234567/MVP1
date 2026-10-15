import { addDays, hhmm, localTime } from './time';

export type ShiftKey = 'am' | 'pm' | 'on';

export interface ShiftDef {
	key: ShiftKey;
	label: string;
	/** Inclusive start, HH:MM */
	start: string;
	/** Exclusive end, HH:MM (the overnight shift ends the next morning) */
	end: string;
}

// AM 07-15, PM 15-23, ON 23-07 (CLAUDE.md Domain Quick Reference)
export const SHIFTS: readonly ShiftDef[] = [
	{ key: 'am', label: 'Morning', start: '07:00', end: '15:00' },
	{ key: 'pm', label: 'Evening', start: '15:00', end: '23:00' },
	{ key: 'on', label: 'Overnight', start: '23:00', end: '07:00' }
];

export const SHIFT_HOURS = 8;

/** A previous shift cannot be offered for coverage after it has ended. */
export function shiftIsPast(day: string, shift: ShiftKey, at: Date, timeZone: string): boolean {
	const current = shiftAt(at, timeZone);
	return (
		day < current.day ||
		(day === current.day &&
			SHIFTS.findIndex((s) => s.key === shift) < SHIFTS.findIndex((s) => s.key === current.shift))
	);
}

/** Which shift a clock time (HH:MM) falls in. */
export function shiftForTime(time: string): ShiftKey {
	const t = hhmm(time);
	if (t >= '07:00' && t < '15:00') return 'am';
	if (t >= '15:00' && t < '23:00') return 'pm';
	return 'on';
}

/**
 * The shift running at a moment, and the day it belongs to. An overnight
 * shift belongs to the day it starts, so 02:00 on the 14th is the overnight
 * shift of the 13th.
 */
export function shiftAt(at: Date, timeZone: string): { shift: ShiftKey; day: string } {
	const lt = localTime(at, timeZone);
	const shift = shiftForTime(`${lt.hour}:${lt.minute}`);
	const day = shift === 'on' && lt.hour < 7 ? addDays(lt.day, -1) : lt.day;
	return { shift, day };
}
