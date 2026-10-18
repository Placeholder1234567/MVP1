import { describe, expect, it } from 'vitest';
import {
	dayLabel,
	incidentReviewTitle,
	medRefusalTitle,
	noteApprovedTitle,
	noteSentBackTitle,
	noteSubmittedTitle,
	shiftReminderTitle,
	shiftsStartingSoon
} from '../../../src/lib/domain/index';

describe('care notification wording (notifications.md §2)', () => {
	it('names staff, home, date and record type only', () => {
		expect(dayLabel('2026-10-18')).toBe('Oct 18');
		expect(noteSubmittedTitle('Cara Giver', 'Shift note', 'Oak House', '2026-10-18')).toBe(
			'Cara Giver submitted a shift note for review (Oak House, Oct 18).'
		);
		expect(noteApprovedTitle('Behavior note', 'Oak House', '2026-10-18')).toBe(
			'Your behavior note for Oct 18 at Oak House has been approved.'
		);
		expect(noteSentBackTitle('Shift note', '2026-10-18')).toMatch(
			/^Your shift note for Oct 18 was sent back for revision\./
		);
		expect(medRefusalTitle('held', 'Oak House')).toBe(
			'Medication held recorded at Oak House. Open to review.'
		);
		expect(incidentReviewTitle('Oak House', '2026-10-17')).toBe(
			'Incident at Oak House from Oct 17 still awaiting review.'
		);
		expect(shiftReminderTitle('Evening', 'Oak House', '15:00')).toBe(
			'Reminder: your evening shift at Oak House starts at 15:00.'
		);
	});

	it('keeps Therap terms as written', () => {
		expect(noteSubmittedTitle('Cara Giver', 'T-Log', 'Oak House', '2026-10-18')).toBe(
			'Cara Giver submitted a T-Log for review (Oak House, Oct 18).'
		);
		expect(noteApprovedTitle('GER', 'Oak House', '2026-10-18')).toContain('Your GER for');
	});
});

describe('shift reminders', () => {
	const slots = [
		{ id: 'am', day: '2026-10-18', shift: 'am' as const },
		{ id: 'pm', day: '2026-10-18', shift: 'pm' as const },
		{ id: 'on', day: '2026-10-18', shift: 'on' as const }
	];
	const at = (iso: string) => new Date(iso);

	it('picks shifts starting 20 to 60 minutes from now, in the agency time zone', () => {
		// 14:00 in Chicago (CDT, UTC-5): the 15:00 shift is an hour away.
		const due = shiftsStartingSoon(slots, at('2026-10-18T19:00:00Z'), 'America/Chicago');
		expect(due.map((s) => s.id)).toEqual(['pm']);
		expect(due[0].startsAt.toISOString()).toBe('2026-10-18T20:00:00.000Z');
		expect(due[0].start).toBe('15:00');
	});

	it('skips shifts too far off or about to start', () => {
		expect(shiftsStartingSoon(slots, at('2026-10-18T18:59:00Z'), 'America/Chicago')).toEqual([]);
		expect(shiftsStartingSoon(slots, at('2026-10-18T19:41:00Z'), 'America/Chicago')).toEqual([]);
		expect(
			shiftsStartingSoon(slots, at('2026-10-19T03:30:00Z'), 'America/Chicago').map((s) => s.id)
		).toEqual(['on']);
	});
});
