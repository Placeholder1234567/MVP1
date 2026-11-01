// typedInstant: datetime-local values as agency wall times, refusing the
// hour skipped when clocks go forward instead of silently moving it.
import { describe, expect, it } from 'vitest';
import { typedInstant } from '../../../src/lib/domain/med-reminders';

const TZ = 'America/New_York';

describe('typedInstant', () => {
	it('reads an ordinary time in the agency zone', () => {
		expect(typedInstant('2026-01-01T00:00', TZ)?.toISOString()).toBe('2026-01-01T05:00:00.000Z');
		expect(typedInstant('2026-07-01T09:15', TZ)?.toISOString()).toBe('2026-07-01T13:15:00.000Z');
	});

	it('refuses a time in the hour skipped when clocks go forward', () => {
		expect(typedInstant('2026-03-08T02:30', TZ)).toBeNull();
		expect(typedInstant('2026-03-08T02:00', TZ)).toBeNull();
		expect(typedInstant('2026-03-08T01:59', TZ)?.toISOString()).toBe('2026-03-08T06:59:00.000Z');
		expect(typedInstant('2026-03-08T03:00', TZ)?.toISOString()).toBe('2026-03-08T07:00:00.000Z');
	});

	it('takes the first occurrence in the hour repeated when clocks go back', () => {
		// 01:30 happens at 05:30Z (EDT) and again at 06:30Z (EST).
		expect(typedInstant('2026-11-01T01:30', TZ)?.toISOString()).toBe('2026-11-01T05:30:00.000Z');
		// East of UTC: 02:30 in Berlin is 00:30Z (CEST), then 01:30Z (CET).
		expect(typedInstant('2026-10-25T02:30', 'Europe/Berlin')?.toISOString()).toBe(
			'2026-10-25T00:30:00.000Z'
		);
		// A half-hour change: Lord Howe 01:45 is 14:45Z (+11), then 15:15Z (+10:30).
		expect(typedInstant('2026-04-05T01:45', 'Australia/Lord_Howe')?.toISOString()).toBe(
			'2026-04-04T14:45:00.000Z'
		);
		// Outside the repeated hour there is one occurrence.
		expect(typedInstant('2026-10-25T03:30', 'Europe/Berlin')?.toISOString()).toBe(
			'2026-10-25T02:30:00.000Z'
		);
	});

	it('refuses the skipped hour east of UTC too', () => {
		expect(typedInstant('2026-03-29T02:30', 'Europe/Berlin')).toBeNull();
		expect(typedInstant('2026-10-04T02:15', 'Australia/Lord_Howe')).toBeNull();
	});

	it('refuses malformed and empty values', () => {
		expect(typedInstant('', TZ)).toBeNull();
		expect(typedInstant('2026-01-01', TZ)).toBeNull();
		expect(typedInstant('2026-02-30T10:00', TZ)).toBeNull();
	});

	it('works in a zone without daylight saving', () => {
		expect(typedInstant('2026-03-08T02:30', 'America/Phoenix')?.toISOString()).toBe(
			'2026-03-08T09:30:00.000Z'
		);
	});
});
