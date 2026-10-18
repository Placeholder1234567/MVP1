import { describe, expect, it } from 'vitest';
import {
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
		expect(outOfRange(series('glucose'), 400)).toBe(false);
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
