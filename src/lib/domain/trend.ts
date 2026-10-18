// Trend arrows and sparklines (frontend-spec-3.md §5.5 "Trend Arrow" and
// "Sparkline"). Pure helpers so the analytics cards and the overview draw the
// same thing from any weekly or daily series.

export type TrendDirection = 'up' | 'steady' | 'down';

export interface TrendChange {
	direction: TrendDirection;
	/** Percent change, rounded; null when the earlier half averaged zero */
	percent: number | null;
	/** ok: better, bad: worse, muted: steady (depends on whether higher is better) */
	tone: 'ok' | 'bad' | 'muted';
}

const average = (values: (number | null)[]) => {
	const known = values.filter((v): v is number => v !== null && Number.isFinite(v));
	return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
};

/**
 * Compares the later half of a series with the earlier half (with four weeks:
 * the last two against the two before). Within ±5% is steady. Null when either
 * half has no values, or both halves are zero.
 */
export function trendChange(values: (number | null)[], higherIsBetter = true): TrendChange | null {
	if (values.length < 2) return null;
	const half = Math.floor(values.length / 2);
	const earlier = average(values.slice(0, half));
	const later = average(values.slice(values.length - half));
	if (earlier === null || later === null) return null;
	if (earlier === 0 && later === 0) return null;
	const percent = earlier === 0 ? null : Math.round(((later - earlier) / earlier) * 100);
	const direction: TrendDirection =
		percent === null ? 'up' : percent > 5 ? 'up' : percent < -5 ? 'down' : 'steady';
	const tone =
		direction === 'steady' ? 'muted' : (direction === 'up') === higherIsBetter ? 'ok' : 'bad';
	return { direction, percent, tone };
}

/**
 * For a weekly series whose last value is the current, unfinished week: the
 * last full week against the average of the (up to two) full weeks before
 * it, as a two-value series for trendChange. A part week would otherwise
 * read as a drop early in the week.
 */
export function fullWeekTrend(values: (number | null)[]): (number | null)[] {
	const full = values.slice(0, -1);
	const last = full.at(-1) ?? null;
	const before = full.slice(-3, -1).filter((v): v is number => v !== null);
	return [before.length ? before.reduce((a, b) => a + b, 0) / before.length : null, last];
}

/** Short text for a change: "+12%", "−8%", "steady", or "up from none". */
export function trendText(change: TrendChange): string {
	if (change.percent === null) return 'up from none';
	if (change.direction === 'steady') return 'steady';
	return `${change.percent > 0 ? '+' : '−'}${Math.abs(change.percent)}%`;
}

/**
 * SVG polyline segments for a sparkline in a width × height box. Missing
 * values break the line, so each run of known values is its own segment.
 * A flat series sits in the middle.
 */
export function sparklineSegments(
	values: (number | null)[],
	width = 80,
	height = 24,
	pad = 2
): { x: number; y: number }[][] {
	const known = values.filter((v): v is number => v !== null && Number.isFinite(v));
	if (!known.length) return [];
	const min = Math.min(...known);
	const max = Math.max(...known);
	const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
	const y = (v: number) =>
		max === min ? height / 2 : pad + (1 - (v - min) / (max - min)) * (height - pad * 2);
	const segments: { x: number; y: number }[][] = [];
	let run: { x: number; y: number }[] = [];
	values.forEach((v, i) => {
		if (v === null || !Number.isFinite(v)) {
			if (run.length) segments.push(run);
			run = [];
			return;
		}
		const x = values.length > 1 ? pad + i * step : width / 2;
		run.push({ x: Math.round(x * 10) / 10, y: Math.round(y(v) * 10) / 10 });
	});
	if (run.length) segments.push(run);
	return segments;
}
