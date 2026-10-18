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

/**
 * Wall-clock minutes left in the shift running at `at` (frontend-spec-2.md
 * §1 greeting countdown, "4h 23m left"). Counted on the clock face, so a
 * daylight-saving change during an overnight shift is off by an hour.
 */
export function shiftMinutesLeft(at: Date, timeZone: string): number {
	const shift = SHIFTS.find((s) => s.key === shiftAt(at, timeZone).shift)!;
	const [h, m] = shift.end.split(':').map(Number);
	const t = localTime(at, timeZone);
	return (h * 60 + m - (t.hour * 60 + t.minute) + 1440) % 1440 || 1440;
}

/** 263 -> "4h 23m left", 240 -> "4h left", 45 -> "45m left". */
export function timeLeftText(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return [h ? `${h}h` : '', m || !h ? `${m}m` : '', 'left'].filter(Boolean).join(' ');
}
