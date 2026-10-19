import { describe, expect, it } from 'vitest';
import {
	baselineBloodPressure,
	lastReadings,
	outOfRange,
	TREND_SERIES,
	trendDomain,
	trendPoints
} from '../../../src/lib/domain/vital-trend';

const series = (key: string) => TREND_SERIES.find((s) => s.key === key)!;

describe('trendPoints', () => {
	const entries = [
		{ recorded_at: '2026-10-12T08:00:00Z', data: { temp: '100.4', pulse: 100 } },
		{ recorded_at: '2026-10-10T08:00:00Z', data: { temp: 98.6, pulse: 101, oxygen: 92 } },
		{ recorded_at: '2026-10-11T08:00:00Z', data: { temp: '', pulse: 'n/a' } },
		{ recorded_at: null, data: { temp: 99 } }
	];

	it('keeps entered readings only, oldest first', () => {
		expect(trendPoints(entries, series('temp'))).toEqual([
			{ at: '2026-10-10T08:00:00Z', value: 98.6, flagged: false },
			{ at: '2026-10-12T08:00:00Z', value: 100.4, flagged: true }
		]);
	});

	it('flags like the health form: temperature at the limit, pulse only above it', () => {
		expect(trendPoints(entries, series('pulse')).map((p) => [p.value, p.flagged])).toEqual([
			[101, true],
			[100, false]
		]);
	});

	it('never flags measurements without configured limits', () => {
		expect(trendPoints(entries, series('oxygen'))).toEqual([
			{ at: '2026-10-10T08:00:00Z', value: 92, flagged: false }
		]);
		expect(outOfRange(series('weight'), 400)).toBe(false);
		expect(outOfRange(series('glucose'), 400)).toBe(true);
	});
});

describe('trendDomain', () => {
	it('covers the readings and the normal band, with padding', () => {
		const [lo, hi] = trendDomain([{ at: 'a', value: 102, flagged: true }], [95, 100.4]);
		expect(lo).toBeLessThan(95);
		expect(hi).toBeGreaterThan(102);
	});
	it('widens a single flat reading', () => {
		expect(trendDomain([{ at: 'a', value: 98, flagged: false }], null)).toEqual([96.8, 99.2]);
	});
});

describe('lastReadings', () => {
	it('keeps the newest reading of each measurement, skipping blanks', () => {
		const entries = [
			{ recorded_at: '2026-10-03T09:00:00Z', data: { weight: 185, pulse: 70 } },
			{ recorded_at: '2026-10-05T09:00:00Z', data: { pulse: '72', weight: '' } },
			{ recorded_at: null, data: { weight: 999 } },
			{ recorded_at: '2026-10-01T09:00:00Z', data: { weight: 180, temp: 'abc' } }
		];
		expect(lastReadings(entries, ['weight', 'pulse', 'temp'])).toEqual({
			weight: { value: 185, at: '2026-10-03T09:00:00Z' },
			pulse: { value: 72, at: '2026-10-05T09:00:00Z' }
		});
	});
});

describe('baselineBloodPressure', () => {
	const e = (at: string, systolic: unknown, diastolic: unknown) => ({
		recorded_at: at,
		data: { systolic, diastolic }
	});
	it('is the latest reading with both numbers in range', () => {
		expect(
			baselineBloodPressure([
				e('2026-10-01T08:00:00Z', 118, 76),
				e('2026-10-03T08:00:00Z', 122, 80),
				e('2026-10-05T08:00:00Z', 150, 80), // top high
				e('2026-10-06T08:00:00Z', 120, 95), // bottom high
				e('2026-10-07T08:00:00Z', 125, null) // incomplete
			])
		).toEqual({ systolic: 122, diastolic: 80, at: '2026-10-03T08:00:00Z' });
	});
	it('is null when no normal reading was saved', () => {
		expect(baselineBloodPressure([e('2026-10-05T08:00:00Z', 160, 100)])).toBeNull();
		expect(baselineBloodPressure([])).toBeNull();
	});
});
