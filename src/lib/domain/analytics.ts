// Weekly buckets for the supervisor analytics (frontend-spec-3.md §4.4):
// weeks start on Monday in the agency's time zone.
import { addDays, localTime } from './time';

/** The Monday (YYYY-MM-DD, agency-local) of the week containing `at`. */
export function weekOf(at: Date | string, timeZone: string): string {
	const day =
		typeof at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(at)
			? at
			: localTime(new Date(at), timeZone).day;
	const weekday = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 Sunday
	return addDays(day, -((weekday + 6) % 7));
}

/** The last `n` week starts, oldest first, ending with the current week. */
export function lastWeeks(now: Date, timeZone: string, n: number): string[] {
	const current = weekOf(now, timeZone);
	return Array.from({ length: n }, (_, i) => addDays(current, -7 * (n - 1 - i)));
}

/** Counts per week for the given weeks (zero where nothing happened). */
export function countByWeek<T>(
	rows: T[],
	weeks: string[],
	weekOfRow: (row: T) => string
): number[] {
	const counts = new Map(weeks.map((w) => [w, 0]));
	for (const r of rows) {
		const w = weekOfRow(r);
		if (counts.has(w)) counts.set(w, counts.get(w)! + 1);
	}
	return weeks.map((w) => counts.get(w)!);
}

/** A ratio as a whole percentage, or null when there is nothing to divide. */
export function percent(part: number, whole: number): number | null {
	return whole ? Math.round((part / whole) * 100) : null;
}
