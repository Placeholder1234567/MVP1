// Vital sign trends (frontend-spec-3.md §5.5 "Line Chart (vital sign
// trends)"; Codex's list item "care trends"). One series per measurement
// from saved vitals entries, with the normal range only where Guad has alert
// limits (the person's own, else VITAL_LIMITS). Weight alerts on change
// rather than a range, so it gets no band; SpO2 has only a low limit, so its
// band runs to 100%.
import { VITAL_LIMITS, type VitalLimits } from './vitals';

export interface TrendSeries {
	key: string;
	label: string;
	unit: string;
	/** Normal range [low, high], or null when no alert limits are configured */
	band: readonly [number, number] | null;
	/** Flags at the high limit itself (temperature, blood pressure) or only above it (pulse) */
	highInclusive: boolean;
}

/** The series with normal ranges from these limits (a person's own, or the defaults). */
export const trendSeries = (lim: VitalLimits = VITAL_LIMITS): readonly TrendSeries[] => [
	{
		key: 'temp',
		label: 'Temperature',
		unit: '°F',
		band: [lim.tempLo, lim.tempHi],
		highInclusive: true
	},
	{
		key: 'pulse',
		label: 'Pulse',
		unit: 'bpm',
		band: [lim.pulseLo, lim.pulseHi],
		highInclusive: false
	},
	{
		key: 'systolic',
		label: 'Blood pressure, top',
		unit: 'mmHg',
		band: [lim.sysLo, lim.sysHi],
		highInclusive: true
	},
	{
		key: 'diastolic',
		label: 'Blood pressure, bottom',
		unit: 'mmHg',
		band: [lim.diaLo, lim.diaHi],
		highInclusive: true
	},
	{ key: 'oxygen', label: 'SpO2', unit: '%', band: [lim.oxygenLo, 100], highInclusive: false },
	{
		key: 'respiration',
		label: 'Respiratory rate',
		unit: 'breaths/min',
		band: [lim.respLo, lim.respHi],
		highInclusive: true
	},
	{
		key: 'glucose',
		label: 'Blood glucose',
		unit: 'mg/dL',
		band: [lim.glucoseLo, lim.glucoseHi],
		highInclusive: true
	},
	{ key: 'weight', label: 'Weight', unit: 'lb', band: null, highInclusive: false }
];

export const TREND_SERIES = trendSeries();

export interface TrendEntry {
	recorded_at: string | null;
	data: Record<string, unknown>;
}

export interface TrendPoint {
	at: string;
	value: number;
	flagged: boolean;
}

const reading = (v: unknown): number | null => {
	if (v === null || v === undefined || v === '') return null;
	const n = typeof v === 'number' ? v : Number(v);
	return Number.isFinite(n) ? n : null;
};

export function outOfRange(series: TrendSeries, value: number): boolean {
	if (!series.band) return false;
	const [lo, hi] = series.band;
	return value < lo || (series.highInclusive ? value >= hi : value > hi);
}

/** The readings for one measurement, oldest first. */
export function trendPoints(entries: TrendEntry[], series: TrendSeries): TrendPoint[] {
	return entries
		.flatMap((e) => {
			const value = reading(e.data[series.key]);
			return value === null || !e.recorded_at
				? []
				: [{ at: e.recorded_at, value, flagged: outOfRange(series, value) }];
		})
		.sort((a, b) => a.at.localeCompare(b.at));
}

/** The y range to draw: the readings and the normal band, padded a little. */
export function trendDomain(points: TrendPoint[], band: TrendSeries['band']): [number, number] {
	const values = [...points.map((p) => p.value), ...(band ?? [])];
	if (!values.length) return [0, 1];
	let lo = Math.min(...values);
	let hi = Math.max(...values);
	if (lo === hi) {
		lo -= 1;
		hi += 1;
	}
	const pad = (hi - lo) * 0.1;
	return [lo - pad, hi + pad];
}

/**
 * The most recent reading of each measurement (frontend-spec-2.md §6
 * "Last weight"), for the "Last: …" hint under each vitals field.
 */
export function lastReadings(
	entries: TrendEntry[],
	keys: readonly string[]
): Record<string, { value: number; at: string }> {
	const out: Record<string, { value: number; at: string }> = {};
	for (const e of entries) {
		if (!e.recorded_at) continue;
		for (const key of keys) {
			const value = reading(e.data[key]);
			if (value !== null && (!out[key] || e.recorded_at > out[key].at))
				out[key] = { value, at: e.recorded_at };
		}
	}
	return out;
}

/**
 * Baseline blood pressure (frontend-spec-2.md §6 "Baseline BP"): the most
 * recent reading where both top and bottom were within the normal range,
 * shown as a reference under the blood pressure fields. Null when none.
 */
export function baselineBloodPressure(
	entries: TrendEntry[],
	limits: VitalLimits = VITAL_LIMITS
): { systolic: number; diastolic: number; at: string } | null {
	const series = trendSeries(limits);
	const top = series.find((s) => s.key === 'systolic')!;
	const bottom = series.find((s) => s.key === 'diastolic')!;
	let best: { systolic: number; diastolic: number; at: string } | null = null;
	for (const e of entries) {
		const systolic = reading(e.data.systolic);
		const diastolic = reading(e.data.diastolic);
		if (!e.recorded_at || systolic === null || diastolic === null) continue;
		if (outOfRange(top, systolic) || outOfRange(bottom, diastolic)) continue;
		if (!best || e.recorded_at > best.at) best = { systolic, diastolic, at: e.recorded_at };
	}
	return best;
}
