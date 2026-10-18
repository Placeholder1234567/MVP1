// Weekly buckets for the supervisor analytics (frontend-spec-3.md §4.4):
// weeks start on Monday in the agency's time zone.
import { medTimes } from './dose-slots';
import { localInstant } from './med-reminders';
import { shiftIsPast, type ShiftKey } from './shifts';
import { addDays, hhmm, localTime } from './time';

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

export interface ComplianceMed {
	id: string;
	scheduled_times: string[] | null;
	started_at?: Date | string | null;
	stopped_at?: Date | string | null;
}
export interface ComplianceDose {
	id: string;
	medication_id: string;
	day: string;
	scheduled_time: string | null;
	status: string;
	is_prn: boolean;
	amends_id: string | null;
}

/**
 * Medication compliance per week (US-38): scheduled doses given out of those
 * due, as on the MAR grid. A dose is due once its time has
 * passed while the medication was running; a corrected dose counts as its
 * latest correction. Null for a week with nothing due.
 */
export function weeklyDoseCompliance(
	meds: ComplianceMed[],
	doses: ComplianceDose[],
	weeks: string[],
	now: Date,
	timeZone: string
): (number | null)[] {
	const original = new Map(doses.map((d) => [d.id, d]));
	const status = new Map<string, string>();
	const key = (med: string, day: string, time: string) => `${med}|${day}|${hhmm(time)}`;
	// Originals first, then corrections on top (a correction may itself be corrected).
	const ordered = [...doses].sort((a, b) => depth(a) - depth(b));
	function depth(d: ComplianceDose) {
		let n = 0;
		for (let at = d; at.amends_id && original.has(at.amends_id); at = original.get(at.amends_id)!)
			n++;
		return n;
	}
	for (const d of ordered) {
		let root = d;
		while (root.amends_id && original.has(root.amends_id)) root = original.get(root.amends_id)!;
		if (root.is_prn || !root.scheduled_time) continue;
		status.set(key(root.medication_id, root.day, root.scheduled_time), d.status);
	}
	return weeks.map((week) => {
		let due = 0;
		let given = 0;
		for (let i = 0; i < 7; i++) {
			const day = addDays(week, i);
			for (const med of meds)
				for (const time of medTimes(med)) {
					const at = localInstant(day, time, timeZone);
					if (at > now) continue;
					if (med.started_at && new Date(med.started_at) > at) continue;
					if (med.stopped_at && new Date(med.stopped_at) <= at) continue;
					due++;
					if (status.get(key(med.id, day, time)) === 'given') given++;
				}
		}
		return percent(given, due);
	});
}

export interface WorkedShift {
	home_id: string;
	day: string;
	shift: ShiftKey;
	assigned_to: string;
}
export interface ShiftNote {
	home_id: string | null;
	day: string;
	shift: ShiftKey;
	author_id: string | null;
	status: string;
}

/**
 * Documentation completeness per week (US-38): of the shifts worked (an
 * assigned slot whose shift has ended), the share where the person on shift
 * signed at least one note at that home for that day and shift. Null for a
 * week with no shifts worked yet.
 */
export function weeklyNoteCompleteness(
	slots: WorkedShift[],
	notes: ShiftNote[],
	weeks: string[],
	now: Date,
	timeZone: string
): (number | null)[] {
	const signed = new Set(
		notes
			.filter((n) => n.status !== 'draft' && n.author_id && n.home_id)
			.map((n) => `${n.home_id}|${n.day}|${n.shift}|${n.author_id}`)
	);
	return weeks.map((week) => {
		const worked = slots.filter(
			(s) => weekOf(s.day, timeZone) === week && shiftIsPast(s.day, s.shift, now, timeZone)
		);
		return percent(
			worked.filter((s) => signed.has(`${s.home_id}|${s.day}|${s.shift}|${s.assigned_to}`)).length,
			worked.length
		);
	});
}
