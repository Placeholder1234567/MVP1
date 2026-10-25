// Scheduled care reports (Complete plan, `reports_scheduled`;
// research/product-2026-10.md §E): a supervisor asks for the same report
// every week or month, and it is built for them in the background. The
// report covers the period just ended, in the agency's time zone.
import { addDays } from './time';

export const REPORT_FREQUENCIES = ['weekly', 'monthly'] as const;
export type ReportFrequency = (typeof REPORT_FREQUENCIES)[number];

/** Formats a scheduled report can come in (the ones meant for people, not systems). */
export const SCHEDULED_FORMATS = ['csv', 'pdf'] as const;

/** How many schedules one person may have. */
export const MAX_SCHEDULES = 10;

/** How long a scheduled report stays downloadable. */
export const SCHEDULED_REPORT_DAYS = 7;

/** ISO weekday, 1 = Monday ... 7 = Sunday, of a YYYY-MM-DD day. */
export function isoWeekday(day: string): number {
	const d = new Date(`${day}T12:00:00Z`).getUTCDay();
	return d === 0 ? 7 : d;
}

/**
 * The first day after `after` on which the schedule runs: the given weekday
 * for weekly reports, the 1st of the month for monthly ones.
 */
export function nextRunDay(frequency: ReportFrequency, weekday: number, after: string): string {
	if (frequency === 'monthly') {
		const [y, m] = after.split('-').map(Number);
		const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
		return next;
	}
	let day = addDays(after, 1);
	while (isoWeekday(day) !== weekday) day = addDays(day, 1);
	return day;
}

/** The period a run on `runDay` reports on: the 7 days before it, or last month. */
export function reportPeriod(
	frequency: ReportFrequency,
	runDay: string
): { fromDay: string; toDay: string } {
	if (frequency === 'weekly') return { fromDay: addDays(runDay, -7), toDay: addDays(runDay, -1) };
	const toDay = addDays(`${runDay.slice(0, 7)}-01`, -1);
	return { fromDay: `${toDay.slice(0, 7)}-01`, toDay };
}

export const WEEKDAY_LABEL = [
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
	'Sunday'
] as const;

/** "Every Monday" or "On the 1st of each month". */
export function scheduleLabel(frequency: ReportFrequency, weekday: number): string {
	return frequency === 'weekly'
		? `Every ${WEEKDAY_LABEL[weekday - 1]}`
		: 'On the 1st of each month';
}
