// "My hours" on the Me screen (US-26): a staff member's own clock records,
// with week totals and which entries a supervisor added by hand.
import { addDays, localTime, weekStart } from './time';

export interface ClockRow {
	id: string;
	home_id: string | null;
	clock_in_at: string | null;
	clock_out_at: string | null;
	verified: number | null;
	manual_override: number | null;
}

export type ClockKind = 'manual' | 'verified' | 'unverified' | 'open';

export interface HoursEntry {
	id: string;
	homeId: string | null;
	day: string;
	clockIn: Date;
	clockOut: Date | null;
	hours: number;
	kind: ClockKind;
}

export interface MyHours {
	thisWeek: number;
	lastWeek: number;
	entries: HoursEntry[];
}

const hoursBetween = (from: Date, to: Date) => Math.max(0, to.getTime() - from.getTime()) / 3600000;
const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Totals for the current and previous week (Sunday to Saturday, by the day
 * the shift started in the agency's time zone) and the most recent entries.
 * A shift still open counts up to now.
 */
export function myHours(rows: ClockRow[], now: Date, timeZone: string, limit = 14): MyHours {
	const thisStart = weekStart(localTime(now, timeZone).day);
	const lastStart = addDays(thisStart, -7);
	const nextStart = addDays(thisStart, 7);
	let thisWeek = 0;
	let lastWeek = 0;
	const entries: HoursEntry[] = [];
	for (const row of rows) {
		if (!row.clock_in_at) continue;
		const clockIn = new Date(row.clock_in_at);
		if (Number.isNaN(clockIn.getTime())) continue;
		const out = row.clock_out_at ? new Date(row.clock_out_at) : null;
		const clockOut = out && !Number.isNaN(out.getTime()) ? out : null;
		const hours = hoursBetween(clockIn, clockOut ?? now);
		const day = localTime(clockIn, timeZone).day;
		if (day >= thisStart && day < nextStart) thisWeek += hours;
		else if (day >= lastStart && day < thisStart) lastWeek += hours;
		entries.push({
			id: row.id,
			homeId: row.home_id,
			day,
			clockIn,
			clockOut,
			hours: round(hours),
			kind: !clockOut
				? 'open'
				: row.manual_override
					? 'manual'
					: row.verified
						? 'verified'
						: 'unverified'
		});
	}
	entries.sort((a, b) => b.clockIn.getTime() - a.clockIn.getTime());
	return { thisWeek: round(thisWeek), lastWeek: round(lastWeek), entries: entries.slice(0, limit) };
}

/** 7.5 -> "7h 30m", 8 -> "8h", 0.25 -> "15m". */
export function hoursText(hours: number): string {
	const minutes = Math.round(hours * 60);
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (!h) return `${m}m`;
	return m ? `${h}h ${m}m` : `${h}h`;
}

export const CLOCK_KIND_LABEL: Record<ClockKind, string> = {
	manual: 'Added by your supervisor',
	verified: 'Location verified',
	unverified: 'Location not verified',
	open: 'Clocked in'
};
