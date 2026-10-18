// Vital sign trends (frontend-spec-3.md §5.5 "Line Chart (vital sign
// trends)"; Codex's list item "care trends"). One series per measurement
// from saved vitals entries, with the normal range only where Guad has alert
// limits (VITAL_LIMITS). SpO2, respiration, glucose and weight have no
// configured limits yet, so they get no band and no flags.
import { VITAL_LIMITS } from './vitals';

export interface TrendSeries {
	key: string;
	label: string;
	unit: string;
	/** Normal range [low, high], or null when no alert limits are configured */
	band: readonly [number, number] | null;
	/** Flags at the high limit itself (temperature, blood pressure) or only above it (pulse) */
	highInclusive: boolean;
}

export const TREND_SERIES: readonly TrendSeries[] = [
	{
		key: 'temp',
		label: 'Temperature',
		unit: '°F',
		band: [VITAL_LIMITS.tempLo, VITAL_LIMITS.tempHi],
		highInclusive: true
	},
	{
		key: 'pulse',
		label: 'Pulse',
		unit: 'bpm',
		band: [VITAL_LIMITS.pulseLo, VITAL_LIMITS.pulseHi],
		highInclusive: false
	},
	{
		key: 'systolic',
		label: 'Blood pressure, top',
		unit: 'mmHg',
		band: [VITAL_LIMITS.sysLo, VITAL_LIMITS.sysHi],
		highInclusive: true
	},
	{
		key: 'diastolic',
		label: 'Blood pressure, bottom',
		unit: 'mmHg',
		band: [VITAL_LIMITS.diaLo, VITAL_LIMITS.diaHi],
		highInclusive: true
	},
	{ key: 'oxygen', label: 'SpO2', unit: '%', band: null, highInclusive: false },
	{
		key: 'respiration',
		label: 'Respiratory rate',
		unit: 'breaths/min',
		band: null,
		highInclusive: false
	},
	{ key: 'glucose', label: 'Blood glucose', unit: 'mg/dL', band: null, highInclusive: false },
	{ key: 'weight', label: 'Weight', unit: 'lb', band: null, highInclusive: false }
];

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
