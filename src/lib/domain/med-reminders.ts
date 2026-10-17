// Medication-due reminders (notifications.md §2.8). A sweep every few minutes
// finds scheduled doses with no MAR record: those due within the next
// 30 minutes get a reminder to the on-shift caregiver, and those still not
// recorded 30 minutes after their time get an alert to the home's supervisor.
// One alert per home and dose time, never naming the person or medication.
import { dosesDue, type MarSlotRecord, type ScheduledMed } from './dose-slots';
import { addDays, localTime } from './time';

export const REMINDER_LEAD_MINUTES = 30;
export const OVERDUE_AFTER_MINUTES = 30;
/** Past this, a missed sweep doesn't send a late overdue alert for an old dose. */
export const OVERDUE_UNTIL_MINUTES = 120;

export interface HomeMed extends ScheduledMed {
	homeId: string;
	started_at?: Date | string | null;
}

export interface DoseAlert {
	homeId: string;
	/** Local day of the dose, YYYY-MM-DD */
	day: string;
	/** HH:MM */
	time: string;
	/** The instant the dose is due */
	at: Date;
	medicationIds: string[];
}

/** The instant a wall-clock time happens on a local day in a time zone. */
export function localInstant(day: string, time: string, timeZone: string): Date {
	const [h, m] = time.split(':').map(Number);
	const wall = Date.parse(`${day}T00:00:00Z`) + (h * 60 + m) * 60_000;
	let at = wall;
	// Two passes settle the offset, including across a daylight-saving change.
	for (let i = 0; i < 2; i++) {
		const lt = localTime(new Date(at), timeZone);
		const shown = Date.parse(`${lt.day}T00:00:00Z`) + (lt.hour * 60 + lt.minute) * 60_000;
		at += wall - shown;
	}
	return new Date(at);
}

/**
 * The doses at `now` that need a reminder (due within the lead time) or an
 * overdue alert (30 to 120 minutes late), grouped by home and dose time.
 */
export function doseAlerts(
	meds: HomeMed[],
	records: MarSlotRecord[],
	now: Date,
	timeZone: string
): { due: DoseAlert[]; overdue: DoseAlert[] } {
	const today = localTime(now, timeZone).day;
	const due = new Map<string, DoseAlert>();
	const overdue = new Map<string, DoseAlert>();
	const homeOf = new Map(meds.map((m) => [m.id, m.homeId]));
	for (const day of [addDays(today, -1), today, addDays(today, 1)]) {
		for (const slot of dosesDue(meds, records, day, now)) {
			const at = localInstant(day, slot.time, timeZone);
			const med = meds.find((m) => m.id === slot.medicationId);
			if (med?.started_at && new Date(med.started_at) > at) continue;
			const minutes = (now.getTime() - at.getTime()) / 60_000;
			const into =
				minutes < 0 && minutes >= -REMINDER_LEAD_MINUTES
					? due
					: minutes >= OVERDUE_AFTER_MINUTES && minutes < OVERDUE_UNTIL_MINUTES
						? overdue
						: null;
			if (!into) continue;
			const homeId = homeOf.get(slot.medicationId)!;
			const key = `${homeId}|${day}|${slot.time}`;
			const alert = into.get(key) ?? { homeId, day, time: slot.time, at, medicationIds: [] };
			alert.medicationIds.push(slot.medicationId);
			into.set(key, alert);
		}
	}
	const sorted = (m: Map<string, DoseAlert>) =>
		[...m.values()].sort(
			(a, b) => a.at.getTime() - b.at.getTime() || a.homeId.localeCompare(b.homeId)
		);
	return { due: sorted(due), overdue: sorted(overdue) };
}
