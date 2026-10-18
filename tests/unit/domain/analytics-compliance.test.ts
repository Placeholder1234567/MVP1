import { describe, expect, it } from 'vitest';
import {
	weeklyDoseCompliance,
	weeklyNoteCompleteness,
	type ComplianceDose
} from '../../../src/lib/domain/analytics';

const tz = 'UTC';
// Weeks start on Monday: Oct 5 and Oct 12 2026. "Now" is Wednesday Oct 14, 10:00.
const weeks = ['2026-10-05', '2026-10-12'];
const now = new Date('2026-10-14T10:00:00Z');

const dose = (
	id: string,
	day: string,
	time: string,
	status: string,
	extra: Partial<ComplianceDose> = {}
): ComplianceDose => ({
	id,
	medication_id: 'm1',
	day,
	scheduled_time: time,
	status,
	is_prn: false,
	amends_id: null,
	...extra
});

describe('weeklyDoseCompliance', () => {
	const med = { id: 'm1', scheduled_times: ['08:00', '20:00'] };
	it('counts given doses out of those due so far', () => {
		const result = weeklyDoseCompliance(
			[med],
			[
				dose('a', '2026-10-12', '08:00', 'given'),
				dose('b', '2026-10-12', '20:00', 'refused'),
				dose('c', '2026-10-13', '08:00', 'given'),
				dose('d', '2026-10-13', '20:00', 'given'),
				dose('e', '2026-10-14', '08:00', 'given')
			],
			weeks,
			now,
			tz
		);
		// Last week: 14 due, none recorded. This week: 5 due (Wed 20:00 not yet), 4 given.
		expect(result).toEqual([0, 80]);
	});
	it('uses the latest correction and ignores as-needed doses', () => {
		const result = weeklyDoseCompliance(
			[med],
			[
				dose('a', '2026-10-12', '08:00', 'refused'),
				dose('a2', '2026-10-12', '08:00', 'given', { amends_id: 'a' }),
				dose('p', '2026-10-12', '12:00', 'given', { is_prn: true, scheduled_time: null })
			],
			['2026-10-12'],
			new Date('2026-10-12T09:00:00Z'),
			tz
		);
		expect(result).toEqual([100]);
	});
	it('skips days before a medication started or after it stopped, and weeks with nothing due', () => {
		const result = weeklyDoseCompliance(
			[{ ...med, started_at: '2026-10-13T00:00:00Z', stopped_at: '2026-10-13T12:00:00Z' }],
			[dose('a', '2026-10-13', '08:00', 'given')],
			weeks,
			now,
			tz
		);
		expect(result).toEqual([null, 100]);
	});
});

describe('weeklyNoteCompleteness', () => {
	it('counts worked shifts where the person on shift signed a note', () => {
		const slot = (day: string, shift: 'am' | 'pm' | 'on', who: string) => ({
			home_id: 'h1',
			day,
			shift,
			assigned_to: who
		});
		const note = (day: string, shift: 'am' | 'pm' | 'on', who: string, status = 'submitted') => ({
			home_id: 'h1',
			day,
			shift,
			author_id: who,
			status
		});
		const result = weeklyNoteCompleteness(
			[
				slot('2026-10-12', 'am', 'cara'),
				slot('2026-10-12', 'pm', 'dev'),
				slot('2026-10-13', 'am', 'cara'),
				slot('2026-10-14', 'am', 'cara') // still running at 10:00
			],
			[
				note('2026-10-12', 'am', 'cara'),
				note('2026-10-12', 'pm', 'cara'), // not the person on shift
				note('2026-10-13', 'am', 'cara', 'draft') // not signed
			],
			weeks,
			now,
			tz
		);
		expect(result).toEqual([null, 33]);
	});
});
