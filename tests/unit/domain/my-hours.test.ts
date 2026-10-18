import { describe, expect, it } from 'vitest';
import { hoursText, myHours, type ClockRow } from '../../../src/lib/domain/my-hours';

const row = (id: string, inAt: string, outAt: string | null, extra: Partial<ClockRow> = {}) => ({
	id,
	home_id: 'h1',
	clock_in_at: inAt,
	clock_out_at: outAt,
	verified: 1,
	manual_override: 0,
	...extra
});

// Wednesday Oct 14 2026, 18:00 UTC = 14:00 in New York
const now = new Date('2026-10-14T18:00:00Z');
const tz = 'America/New_York';

describe('myHours', () => {
	it('totals this week and last week by the local start day', () => {
		const result = myHours(
			[
				row('a', '2026-10-12T11:00:00Z', '2026-10-12T19:00:00Z'), // Mon, 8h
				row('b', '2026-10-06T11:00:00Z', '2026-10-06T18:30:00Z'), // last Tue, 7.5h
				// Sat Oct 10 22:00 local (Sun 03:00 UTC) belongs to last week
				row('c', '2026-10-11T02:00:00Z', '2026-10-11T06:00:00Z'),
				row('d', '2026-09-20T11:00:00Z', '2026-09-20T19:00:00Z') // older
			],
			now,
			tz
		);
		expect(result.thisWeek).toBe(8);
		expect(result.lastWeek).toBe(11.5);
		expect(result.entries.map((e) => e.id)).toEqual(['a', 'c', 'b', 'd']);
	});
	it('counts an open shift up to now and labels each kind', () => {
		const result = myHours(
			[
				row('open', '2026-10-14T16:00:00Z', null),
				row('m', '2026-10-13T11:00:00Z', '2026-10-13T15:00:00Z', { manual_override: 1 }),
				row('u', '2026-10-12T11:00:00Z', '2026-10-12T12:00:00Z', { verified: 0 })
			],
			now,
			tz
		);
		expect(result.thisWeek).toBe(7);
		expect(result.entries.map((e) => e.kind)).toEqual(['open', 'manual', 'unverified']);
	});
	it('skips rows without a valid clock-in and keeps the latest entries', () => {
		const rows = Array.from({ length: 20 }, (_, i) =>
			row(String(i), new Date(Date.UTC(2026, 8, 1 + i, 11)).toISOString(), null)
		);
		const result = myHours([...rows, row('x', 'not a date', null)], now, tz, 3);
		expect(result.entries.map((e) => e.id)).toEqual(['19', '18', '17']);
	});
});

describe('hoursText', () => {
	it('formats hours and minutes', () => {
		expect(hoursText(7.5)).toBe('7h 30m');
		expect(hoursText(8)).toBe('8h');
		expect(hoursText(0.25)).toBe('15m');
		expect(hoursText(0)).toBe('0m');
	});
});
