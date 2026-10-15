import { hhmm } from './time';

export interface ScheduledMed {
	id: string;
	/** Times of day the dose is due; empty or null means as-needed (PRN) */
	scheduled_times: string[] | null;
	stopped_at?: Date | string | null;
}

export interface DoseSlot {
	medicationId: string;
	/** HH:MM */
	time: string;
}

export interface MarSlotRecord {
	medication_id: string;
	day: string;
	scheduled_time: string | null;
	is_prn: boolean;
	amends_id?: string | null;
	conflict_with?: string | null;
}

/**
 * "8am, 8:30pm, 20:00" -> ["08:00", "20:00", "20:30"] (sorted, de-duplicated).
 * Returns null if any part can't be read, so the form can say so.
 */
export function parseTimes(text: string): string[] | null {
	const out = new Set<string>();
	const parts = text
		.split(/[,;]+/)
		.map((x) => x.trim())
		.filter(Boolean);
	for (const part of parts) {
		const m = part.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
		if (!m) return null;
		let h = Number(m[1]);
		const min = Number(m[2] ?? 0);
		const ap = (m[3] ?? '').toLowerCase();
		if (ap) {
			if (h < 1 || h > 12) return null;
			h = (h % 12) + (ap === 'pm' ? 12 : 0);
		}
		if (h > 23 || min > 59) return null;
		out.add(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
	}
	return [...out].sort();
}

/** A medication's dose times, normalized and sorted. */
export function medTimes(med: ScheduledMed): string[] {
	return [...new Set((med.scheduled_times ?? []).map(hhmm))].sort();
}

export function isScheduled(med: ScheduledMed, at: Date = new Date()): boolean {
	const stopped = med.stopped_at != null && new Date(med.stopped_at) <= at;
	return !stopped && medTimes(med).length > 0;
}

/** Every scheduled dose for the day, in time order. */
export function doseSlots(meds: ScheduledMed[], at: Date = new Date()): DoseSlot[] {
	return meds
		.filter((m) => isScheduled(m, at))
		.flatMap((m) => medTimes(m).map((time) => ({ medicationId: m.id, time })))
		.sort((a, b) =>
			a.time === b.time ? a.medicationId.localeCompare(b.medicationId) : a.time < b.time ? -1 : 1
		);
}

/**
 * Doses with no MAR record yet. A dose counts as answered by its original
 * record (given, refused or held); amendments and conflict copies don't open
 * or close a slot. Mirrors the unique index mar_records_client_med_day_slot_idx.
 */
export function dosesDue(
	meds: ScheduledMed[],
	records: MarSlotRecord[],
	day: string,
	at: Date = new Date()
): DoseSlot[] {
	const answered = new Set(
		records
			.filter(
				(r) => !r.is_prn && r.day === day && r.scheduled_time && !r.amends_id && !r.conflict_with
			)
			.map((r) => `${r.medication_id}|${hhmm(r.scheduled_time as string)}`)
	);
	return doseSlots(meds, at).filter((d) => !answered.has(`${d.medicationId}|${d.time}`));
}
