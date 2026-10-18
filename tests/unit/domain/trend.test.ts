import { describe, expect, it } from 'vitest';
import {
	fullWeekTrend,
	sparklineSegments,
	trendChange,
	trendText
} from '../../../src/lib/domain/trend';
import { dailyCompliance, type GridRow } from '../../../src/lib/domain/mar-grid';

describe('trendChange', () => {
	it('compares the last two weeks with the two before', () => {
		expect(trendChange([10, 10, 12, 12])).toEqual({ direction: 'up', percent: 20, tone: 'ok' });
		expect(trendChange([10, 10, 8, 8])).toEqual({ direction: 'down', percent: -20, tone: 'bad' });
	});
	it('is steady within 5% either way', () => {
		expect(trendChange([100, 100, 105, 104])?.direction).toBe('steady');
		expect(trendChange([100, 100, 95, 96])?.tone).toBe('muted');
	});
	it('flips the colour when lower is better', () => {
		expect(trendChange([4, 4, 2, 2], false)).toEqual({
			direction: 'down',
			percent: -50,
			tone: 'ok'
		});
		expect(trendChange([2, 2, 4, 4], false)?.tone).toBe('bad');
	});
	it('ignores missing weeks and needs a value in each half', () => {
		expect(trendChange([null, 10, 15, null])?.percent).toBe(50);
		expect(trendChange([null, null, 5, 6])).toBeNull();
		expect(trendChange([0, 0, 0, 0])).toBeNull();
		expect(trendChange([7])).toBeNull();
	});
	it('says "up from none" after an all-zero start', () => {
		const change = trendChange([0, 0, 3, 1])!;
		expect(change).toEqual({ direction: 'up', percent: null, tone: 'ok' });
		expect(trendText(change)).toBe('up from none');
	});
	it('formats the change', () => {
		expect(trendText({ direction: 'up', percent: 12, tone: 'ok' })).toBe('+12%');
		expect(trendText({ direction: 'down', percent: -8, tone: 'bad' })).toBe('−8%');
		expect(trendText({ direction: 'steady', percent: 3, tone: 'muted' })).toBe('steady');
	});
});

describe('sparklineSegments', () => {
	it('spreads points across the box with the highest value at the top', () => {
		expect(sparklineSegments([0, 5, 10], 80, 24, 2)).toEqual([
			[
				{ x: 2, y: 22 },
				{ x: 40, y: 12 },
				{ x: 78, y: 2 }
			]
		]);
	});
	it('breaks the line at missing values', () => {
		const segments = sparklineSegments([1, null, 3, 4]);
		expect(segments.map((s) => s.length)).toEqual([1, 2]);
	});
	it('draws a flat series through the middle, and nothing for no data', () => {
		expect(
			sparklineSegments([5, 5])
				.flat()
				.map((p) => p.y)
		).toEqual([12, 12]);
		expect(sparklineSegments([null, null])).toEqual([]);
	});
});

describe('dailyCompliance', () => {
	const row = (cells: GridRow['cells']): GridRow => ({
		medicationId: 'm',
		name: 'Synthetic',
		dose: '',
		time: '08:00',
		cells
	});
	const given = { kind: 'given', corrected: false, conflict: false } as const;
	const refused = { kind: 'refused', corrected: false, conflict: false } as const;
	it('adds up every person’s grid day by day', () => {
		const a = [row([given, given, { kind: 'missing' }, { kind: 'upcoming' }])];
		const b = [row([refused, given, given, { kind: 'na' }])];
		expect(dailyCompliance([a, b], 4)).toEqual([50, 100, 50, null]);
	});
	it('ignores as-needed rows', () => {
		expect(dailyCompliance([[row([{ kind: 'prn', count: 2 }])]], 1)).toEqual([null]);
	});
});

describe('fullWeekTrend', () => {
	it('drops the current part week and compares the last full week with the two before', () => {
		// A steady 70 a week, and 10 so far this Monday: steady, not a drop.
		expect(trendChange(fullWeekTrend([70, 70, 70, 10]))?.direction).toBe('steady');
		expect(fullWeekTrend([60, 80, 90, 5])).toEqual([70, 90]);
		expect(trendChange(fullWeekTrend([60, 80, 90, 5]))?.percent).toBe(29);
	});
	it('copes with missing weeks', () => {
		expect(fullWeekTrend([null, 40, 50, 1])).toEqual([40, 50]);
		expect(fullWeekTrend([null, null, 50, 1])).toEqual([null, 50]);
		expect(fullWeekTrend([5])).toEqual([null, null]);
	});
});
