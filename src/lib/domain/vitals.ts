// Default limits from the MVP (mvp/src/app-core.js LIM). A nurse or supervisor
// can set a person's own limits (client_health_info.vital_limits), for example
// a lower blood-pressure range for someone whose normal runs low; any limit
// they leave blank keeps the default (frontend-audit.md finding 18).
export const VITAL_LIMITS = {
	tempHi: 100.4,
	tempLo: 95,
	pulseHi: 100,
	pulseLo: 50,
	sysHi: 140,
	sysLo: 90,
	diaHi: 90,
	diaLo: 60,
	// charting-guide.md "Vital Sign Alerts": blood glucose 250 or above, or below 70
	glucoseHi: 250,
	glucoseLo: 70
} as const;

/** A weight this far from the person's last weight is flagged (charting-guide.md). */
export const WEIGHT_CHANGE_LB = 5;

/** Whether a weight moved at least WEIGHT_CHANGE_LB from the previous one. */
export function weightChanged(
	weight: number | null | undefined,
	previous: number | null | undefined
) {
	return (
		weight != null &&
		previous != null &&
		Number.isFinite(weight) &&
		Number.isFinite(previous) &&
		Math.abs(weight - previous) >= WEIGHT_CHANGE_LB
	);
}

export type VitalLimits = { -readonly [K in keyof typeof VITAL_LIMITS]: number };
export type VitalLimitKey = keyof VitalLimits;

/** The pairs a person's limits are set in, with the range a limit may take. */
export const VITAL_LIMIT_PAIRS: readonly {
	label: string;
	unit: string;
	lo: VitalLimitKey;
	hi: VitalLimitKey;
	min: number;
	max: number;
}[] = [
	{ label: 'Temperature', unit: '°F', lo: 'tempLo', hi: 'tempHi', min: 90, max: 106 },
	{ label: 'Pulse', unit: 'bpm', lo: 'pulseLo', hi: 'pulseHi', min: 20, max: 220 },
	{ label: 'Blood pressure, top', unit: 'mmHg', lo: 'sysLo', hi: 'sysHi', min: 50, max: 250 },
	{ label: 'Blood pressure, bottom', unit: 'mmHg', lo: 'diaLo', hi: 'diaHi', min: 30, max: 150 },
	{ label: 'Blood glucose', unit: 'mg/dL', lo: 'glucoseLo', hi: 'glucoseHi', min: 20, max: 600 }
];

/**
 * A person's limits from their stored overrides (JSON text on the device,
 * an object on the server). Each pair keeps the default unless both ends
 * are usable: in range, and low below high.
 */
export function parseVitalLimits(raw: unknown): VitalLimits {
	let v = raw;
	if (typeof v === 'string') {
		try {
			v = JSON.parse(v);
		} catch {
			v = null;
		}
	}
	const set = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
	const limits: VitalLimits = { ...VITAL_LIMITS };
	for (const p of VITAL_LIMIT_PAIRS) {
		const num = (k: VitalLimitKey) =>
			typeof set[k] === 'number' && set[k] >= p.min && set[k] <= p.max
				? (set[k] as number)
				: VITAL_LIMITS[k];
		const lo = num(p.lo);
		const hi = num(p.hi);
		if (lo < hi) {
			limits[p.lo] = lo;
			limits[p.hi] = hi;
		}
	}
	return limits;
}

export interface Vitals {
	temp?: number | null;
	pulse?: number | null;
	sys?: number | null;
	dia?: number | null;
	glucose?: number | null;
}

export type VitalFlag = 'temperature' | 'pulse' | 'blood_pressure' | 'glucose';

/**
 * Which readings are outside the limits. Matches the MVP exactly: temperature,
 * systolic and diastolic flag at or above the high limit; pulse flags only
 * above it. Readings below a low limit always flag. Blood glucose (not in the
 * MVP) flags at or above its high limit, as charting-guide.md words it.
 */
export function vitalFlags(v: Vitals, lim: VitalLimits = VITAL_LIMITS): VitalFlag[] {
	const flags: VitalFlag[] = [];
	const has = (x: number | null | undefined): x is number => x != null && !Number.isNaN(x);
	if (has(v.temp) && (v.temp >= lim.tempHi || v.temp < lim.tempLo)) flags.push('temperature');
	if (has(v.pulse) && (v.pulse > lim.pulseHi || v.pulse < lim.pulseLo)) flags.push('pulse');
	if (
		(has(v.sys) && (v.sys >= lim.sysHi || v.sys < lim.sysLo)) ||
		(has(v.dia) && (v.dia >= lim.diaHi || v.dia < lim.diaLo))
	) {
		flags.push('blood_pressure');
	}
	if (has(v.glucose) && (v.glucose >= lim.glucoseHi || v.glucose < lim.glucoseLo))
		flags.push('glucose');
	return flags;
}
