import { describe, expect, it } from 'vitest';
import { shiftMinutesLeft, timeLeftText } from '../../../src/lib/domain/shifts';

describe('shiftMinutesLeft', () => {
	const at = (iso: string) => shiftMinutesLeft(new Date(iso), 'UTC');
	it('counts down to the end of the current shift', () => {
		expect(at('2026-10-18T10:37:00Z')).toBe(263); // morning, ends 15:00
		expect(at('2026-10-18T15:00:00Z')).toBe(480); // evening just started
		expect(at('2026-10-18T23:30:00Z')).toBe(450); // overnight, ends 07:00
		expect(at('2026-10-19T06:59:00Z')).toBe(1);
	});
	it('uses the agency time zone', () => {
		// 10:37 UTC is 06:37 in New York (EDT): the overnight shift, 23 minutes left.
		expect(shiftMinutesLeft(new Date('2026-10-18T10:37:00Z'), 'America/New_York')).toBe(23);
	});
});

describe('timeLeftText', () => {
	it('formats hours and minutes', () => {
		expect(timeLeftText(263)).toBe('4h 23m left');
		expect(timeLeftText(240)).toBe('4h left');
		expect(timeLeftText(45)).toBe('45m left');
		expect(timeLeftText(1)).toBe('1m left');
	});
});
