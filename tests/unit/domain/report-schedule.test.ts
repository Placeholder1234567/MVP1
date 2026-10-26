import { expect, it } from 'vitest';
import {
	isoWeekday,
	nextRunDay,
	reportPeriod,
	scheduleLabel
} from '../../../src/lib/domain/report-schedule';

it('finds the next weekday strictly after a day, and the 1st of next month', () => {
	expect(isoWeekday('2026-10-19')).toBe(1);
	expect(isoWeekday('2026-10-25')).toBe(7);
	expect(nextRunDay('weekly', 1, '2026-10-19')).toBe('2026-10-26');
	expect(nextRunDay('weekly', 1, '2026-10-25')).toBe('2026-10-26');
	expect(nextRunDay('weekly', 5, '2026-10-19')).toBe('2026-10-23');
	expect(nextRunDay('monthly', 1, '2026-10-01')).toBe('2026-11-01');
	expect(nextRunDay('monthly', 1, '2026-12-31')).toBe('2027-01-01');
});

it('reports on the seven days before, or the whole previous month', () => {
	expect(reportPeriod('weekly', '2026-10-19')).toEqual({
		fromDay: '2026-10-12',
		toDay: '2026-10-18'
	});
	expect(reportPeriod('monthly', '2026-03-01')).toEqual({
		fromDay: '2026-02-01',
		toDay: '2026-02-28'
	});
	expect(reportPeriod('monthly', '2027-01-01')).toEqual({
		fromDay: '2026-12-01',
		toDay: '2026-12-31'
	});
	// A late run still reports on the month it was due for.
	expect(reportPeriod('monthly', '2026-11-03')).toEqual({
		fromDay: '2026-10-01',
		toDay: '2026-10-31'
	});
	expect(scheduleLabel('weekly', 3)).toBe('Every Wednesday');
	expect(scheduleLabel('monthly', 1)).toBe('On the 1st of each month');
});
