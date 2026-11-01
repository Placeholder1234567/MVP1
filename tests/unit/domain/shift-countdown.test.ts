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
	it('counts real time across a daylight-saving change in the overnight shift', () => {
		const ny = (iso: string) => shiftMinutesLeft(new Date(iso), 'America/New_York');
		// Clocks go back on 2026-11-01: 23:30 EDT to 07:00 EST is 8 h 30 m.
		expect(ny('2026-11-01T03:30:00Z')).toBe(510);
		// Clocks go forward on 2026-03-08: 23:30 EST to 07:00 EDT is 6 h 30 m.
		expect(ny('2026-03-08T04:30:00Z')).toBe(390);
		// After the change the clock face and real time agree again.
		expect(ny('2026-11-01T11:00:00Z')).toBe(60); // 06:00 EST
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
