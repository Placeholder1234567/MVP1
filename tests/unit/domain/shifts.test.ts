import { describe, expect, it } from 'vitest';
import { addDays, hhmm, shiftAt, shiftForTime, weekStart } from '../../../src/lib/domain';

const NY = 'America/New_York';

describe('shiftAt', () => {
	it('uses the agency time zone, not the machine clock', () => {
		// 2026-10-13 12:30 UTC is 08:30 in New York (EDT)
		expect(shiftAt(new Date('2026-10-13T12:30:00Z'), NY)).toEqual({
			shift: 'am',
			day: '2026-10-13'
		});
	});

	it('switches at 15:00 and 23:00 local', () => {
		expect(shiftAt(new Date('2026-10-13T18:59:00Z'), NY).shift).toBe('am'); // 14:59
		expect(shiftAt(new Date('2026-10-13T19:00:00Z'), NY).shift).toBe('pm'); // 15:00
		expect(shiftAt(new Date('2026-10-14T03:00:00Z'), NY)).toEqual({
			shift: 'on',
			day: '2026-10-13'
		}); // 23:00
	});

	it('puts the early morning in the previous day’s overnight shift', () => {
		// 02:00 on the 14th in New York
		expect(shiftAt(new Date('2026-10-14T06:00:00Z'), NY)).toEqual({
			shift: 'on',
			day: '2026-10-13'
		});
		// 07:00 on the 14th starts the new day's morning shift
		expect(shiftAt(new Date('2026-10-14T11:00:00Z'), NY)).toEqual({
			shift: 'am',
			day: '2026-10-14'
		});
	});
});

describe('shiftForTime', () => {
	it.each([
		['06:59', 'on'],
		['07:00', 'am'],
		['08:00:00', 'am'],
		['14:59', 'am'],
		['15:00', 'pm'],
		['22:59', 'pm'],
		['23:00', 'on'],
		['00:30', 'on']
	])('%s is %s', (t, k) => expect(shiftForTime(t)).toBe(k));
});

describe('day helpers', () => {
	it('adds days across month and DST boundaries', () => {
		expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
		expect(addDays('2026-11-01', 1)).toBe('2026-11-02'); // US DST ends Nov 1
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
	});

	it('weeks start on Sunday', () => {
		expect(weekStart('2026-10-13')).toBe('2026-10-11'); // Tuesday -> Sunday
		expect(weekStart('2026-10-11')).toBe('2026-10-11');
		expect(weekStart('2026-10-17')).toBe('2026-10-11'); // Saturday
	});

	it('normalizes Postgres time values', () => {
		expect(hhmm('08:00:00')).toBe('08:00');
		expect(hhmm('8:5')).toBe('08:05');
	});
});
