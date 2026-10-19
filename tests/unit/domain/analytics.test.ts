import { describe, expect, it } from 'vitest';
import { countByWeek, lastWeeks, latestDoses, percent, weekOf } from '../../../src/lib/domain';

describe('analytics weeks', () => {
	it('starts weeks on Monday in the agency time zone', () => {
		// Sunday 2026-10-18 23:30 in New York is Monday 03:30 UTC.
		expect(weekOf(new Date('2026-10-19T03:30:00Z'), 'America/New_York')).toBe('2026-10-12');
		expect(weekOf(new Date('2026-10-19T03:30:00Z'), 'UTC')).toBe('2026-10-19');
		expect(weekOf('2026-10-14', 'UTC')).toBe('2026-10-12');
		expect(weekOf('2026-10-12', 'UTC')).toBe('2026-10-12');
	});

	it('lists the last n weeks, oldest first', () => {
		expect(lastWeeks(new Date('2026-10-15T12:00:00Z'), 'UTC', 4)).toEqual([
			'2026-09-21',
			'2026-09-28',
			'2026-10-05',
			'2026-10-12'
		]);
	});

	it('counts per week and ignores rows outside the window', () => {
		const weeks = ['2026-10-05', '2026-10-12'];
		const days = ['2026-10-06', '2026-10-13', '2026-10-14', '2026-09-01'];
		expect(countByWeek(days, weeks, (d) => weekOf(d, 'UTC'))).toEqual([1, 2]);
	});

	it('gives whole percentages, or none with nothing to divide', () => {
		expect(percent(2, 3)).toBe(67);
		expect(percent(0, 0)).toBeNull();
	});
});

describe('latestDoses', () => {
	const dose = (id: string, status: string, amends_id: string | null = null) => ({
		id,
		medication_id: 'm',
		day: '2026-10-14',
		scheduled_time: '08:00',
		status,
		is_prn: false,
		amends_id
	});
	it('counts each dose once, as its latest correction', () => {
		const doses = [
			dose('a', 'given'),
			dose('b', 'refused', 'a'),
			dose('c', 'held', 'b'),
			dose('d', 'given')
		];
		expect(
			latestDoses(doses)
				.map((d) => [d.id, d.status])
				.sort()
		).toEqual([
			['c', 'held'],
			['d', 'given']
		]);
		// Order of rows doesn't matter.
		expect(
			latestDoses([...doses].reverse())
				.map((d) => d.id)
				.sort()
		).toEqual(['c', 'd']);
	});
});
