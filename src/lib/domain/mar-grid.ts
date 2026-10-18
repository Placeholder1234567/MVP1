// The traditional MAR grid (frontend-spec-3.md §5.5 "MAR Grid"; charting-guide.md
// "Therap's eMAR"): one row per medication and dose time, one column per day.
// Works from the records on the device (30 days of MAR sync, offline-sync.md §7).
import { addDays, hhmm } from './time';

export type GridCell =
	| { kind: 'given' | 'refused' | 'held'; corrected: boolean; conflict: boolean }
	| { kind: 'missing' }
	| { kind: 'upcoming' }
	| { kind: 'na' }
	/** As-needed doses: how many were given that day */
	| { kind: 'prn'; count: number };

export interface GridMed {
	id: string;
	name: string | null;
	dose: string | null;
	scheduled_times: string[] | null;
	started_at?: string | null;
	stopped_at?: string | null;
}

export interface GridRecord {
	id: string;
	medication_id: string | null;
	day: string | null;
	scheduled_time: string | null;
	status: string | null;
	is_prn: boolean;
	amends_id: string | null;
	conflict_with: string | null;
	recorded_at: string | null;
}

export interface GridRow {
	medicationId: string;
	name: string;
	dose: string;
	/** HH:MM, or null for as-needed */
	time: string | null;
	cells: GridCell[];
}

/** The seven days starting at `start` (YYYY-MM-DD). */
export const weekDays = (start: string) => Array.from({ length: 7 }, (_, i) => addDays(start, i));

const dayOf = (iso: string | null | undefined, toDay: (iso: string) => string) =>
	iso ? toDay(iso) : null;

/**
 * Builds the grid. `toDay` turns an instant into the agency's local day;
 * `now` is the local day and HH:MM, so doses later today read as upcoming.
 * A corrected dose shows the latest correction's status.
 */
export function marGrid(
	meds: GridMed[],
	records: GridRecord[],
	days: string[],
	now: { day: string; time: string },
	toDay: (iso: string) => string
): GridRow[] {
	const originals = new Map<string, GridRecord>();
	const corrections = new Map<string, GridRecord>();
	for (const r of records) {
		if (r.is_prn || !r.medication_id || !r.day || !r.scheduled_time) continue;
		if (r.amends_id) {
			const prev = corrections.get(r.amends_id);
			if (!prev || (r.recorded_at ?? '') > (prev.recorded_at ?? ''))
				corrections.set(r.amends_id, r);
		} else if (!r.conflict_with) {
			originals.set(`${r.medication_id}|${r.day}|${hhmm(r.scheduled_time)}`, r);
		}
	}
	const conflicts = new Set(
		records
			.filter((r) => r.conflict_with && r.medication_id && r.day && r.scheduled_time)
			.map((r) => `${r.medication_id}|${r.day}|${hhmm(r.scheduled_time!)}`)
	);
	const prnCount = new Map<string, number>();
	for (const r of records)
		if (r.is_prn && r.status === 'given' && r.medication_id && r.day && !r.amends_id)
			prnCount.set(
				`${r.medication_id}|${r.day}`,
				(prnCount.get(`${r.medication_id}|${r.day}`) ?? 0) + 1
			);

	const rows: GridRow[] = [];
	for (const med of [...meds].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))) {
		const started = dayOf(med.started_at, toDay);
		const stopped = dayOf(med.stopped_at, toDay);
		const active = (day: string) => (!started || started <= day) && (!stopped || day <= stopped);
		const times = [...new Set((med.scheduled_times ?? []).map(hhmm))].sort();
		const base = { medicationId: med.id, name: med.name ?? 'Medication', dose: med.dose ?? '' };
		if (!times.length) {
			if (!days.some((d) => active(d) || prnCount.has(`${med.id}|${d}`))) continue;
			rows.push({
				...base,
				time: null,
				cells: days.map((d) =>
					active(d) || prnCount.has(`${med.id}|${d}`)
						? { kind: 'prn', count: prnCount.get(`${med.id}|${d}`) ?? 0 }
						: { kind: 'na' }
				)
			});
			continue;
		}
		for (const time of times) {
			const cells = days.map((day): GridCell => {
				const key = `${med.id}|${day}|${time}`;
				const original = originals.get(key);
				if (original) {
					const latest = corrections.get(original.id) ?? original;
					const kind =
						latest.status === 'given' || latest.status === 'refused' || latest.status === 'held'
							? latest.status
							: 'given';
					return { kind, corrected: latest !== original, conflict: conflicts.has(key) };
				}
				if (!active(day)) return { kind: 'na' };
				if (day > now.day || (day === now.day && time > now.time)) return { kind: 'upcoming' };
				return { kind: 'missing' };
			});
			if (cells.every((c) => c.kind === 'na')) continue;
			rows.push({ ...base, time, cells });
		}
	}
	return rows;
}

/** Share of due scheduled doses given (frontend-spec-3.md compliance bar), or null if none were due. */
export function compliance(rows: GridRow[]): {
	given: number;
	due: number;
	percent: number | null;
} {
	let given = 0;
	let due = 0;
	for (const row of rows)
		for (const c of row.cells) {
			if (c.kind === 'given' || c.kind === 'refused' || c.kind === 'held' || c.kind === 'missing')
				due++;
			if (c.kind === 'given') given++;
		}
	return { given, due, percent: due ? Math.round((given / due) * 100) : null };
}

/** Bar colour band: >= 95 ok, 90-94 caution, < 90 bad. */
export const complianceBand = (percent: number) =>
	percent >= 95 ? 'ok' : percent >= 90 ? 'caution' : 'bad';
