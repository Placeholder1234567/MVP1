// Wording of care-record notifications (notifications.md §2.4–2.7, 2.12,
// 2.13). Titles go to lock screens and SMS, so they carry staff names, home
// names, dates and record types only: never a person supported, medication,
// dose, reason or note text (notifications.md §1). Details open in the app.
import { localInstant } from './med-reminders';
import { SHIFTS, type ShiftKey } from './shifts';
import { dayLabel } from './time';

/** "Shift note" reads "shift note" mid-sentence; Therap terms (T-Log, GER) stay as they are. */
const inSentence = (label: string) =>
	/^[A-Z][a-z]/.test(label) ? label[0].toLowerCase() + label.slice(1) : label;

export const noteSubmittedTitle = (author: string, noteType: string, home: string, day: string) =>
	`${author} submitted a ${inSentence(noteType)} for review (${home}, ${dayLabel(day)}).`;

export const noteApprovedTitle = (noteType: string, home: string, day: string) =>
	`Your ${inSentence(noteType)} for ${dayLabel(day)} at ${home} has been approved.`;

export const noteSentBackTitle = (noteType: string, day: string) =>
	`Your ${inSentence(noteType)} for ${dayLabel(day)} was sent back for revision. Open it to read your supervisor’s comment.`;

export const medRefusalTitle = (status: 'refused' | 'held', home: string) =>
	`Medication ${status} recorded at ${home}. Open to review.`;

export const incidentReviewTitle = (home: string, day: string) =>
	`Incident at ${home} from ${dayLabel(day)} still awaiting review.`;

export const shiftReminderTitle = (shiftLabel: string, home: string, start: string) =>
	`Reminder: your ${shiftLabel.toLowerCase()} shift at ${home} starts at ${start}.`;

/** Shift reminders go out about an hour ahead (notifications.md §2.13). */
export const SHIFT_REMINDER_MINUTES = 60;
/** A reminder later than this before the start isn't worth sending. */
export const SHIFT_REMINDER_LATEST_MINUTES = 20;

/**
 * Slots whose shift starts between 20 and 60 minutes from now, with their
 * start instant. The sweep runs every 15 minutes, so every slot falls in one
 * run; already-sent reminders are skipped by the caller.
 */
export function shiftsStartingSoon<T extends { day: string; shift: ShiftKey }>(
	slots: T[],
	now: Date,
	timeZone: string
): (T & { startsAt: Date; start: string })[] {
	return slots.flatMap((slot) => {
		const def = SHIFTS.find((s) => s.key === slot.shift);
		if (!def) return [];
		const startsAt = localInstant(slot.day, def.start, timeZone);
		const minutes = (startsAt.getTime() - now.getTime()) / 60_000;
		return minutes > SHIFT_REMINDER_LATEST_MINUTES && minutes <= SHIFT_REMINDER_MINUTES
			? [{ ...slot, startsAt, start: def.start }]
			: [];
	});
}

/** Open incidents are flagged once after 24 hours; escalation repeats it (notifications.md §2.12). */
export const INCIDENT_REVIEW_AFTER_HOURS = 24;
/** The daily repeats stop after 3 days, so older incidents aren't newly flagged. */
export const INCIDENT_REVIEW_UNTIL_HOURS = 72;

export const controlledDiscrepancyTitle = (home: string) =>
	`Controlled medication count does not match at ${home}. Review now.`;

export const controlledCountersignTitle = (recorder: string, home: string) =>
	`${recorder} asked you to countersign a controlled medication entry at ${home}.`;
