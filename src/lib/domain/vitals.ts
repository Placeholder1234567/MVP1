// Placeholder limits from the MVP (mvp/src/app-core.js LIM). Production needs
// per-person limits set by the agency nurse (mvp/README.md checklist).
export const VITAL_LIMITS = {
	tempHi: 100.4,
	tempLo: 95,
	pulseHi: 100,
	pulseLo: 50,
	sysHi: 140,
	sysLo: 90,
	diaHi: 90,
	diaLo: 60
} as const;

export type VitalLimits = { [K in keyof typeof VITAL_LIMITS]: number };

export interface Vitals {
	temp?: number | null;
	pulse?: number | null;
	sys?: number | null;
	dia?: number | null;
}

export type VitalFlag = 'temperature' | 'pulse' | 'blood_pressure';

/**
 * Which readings are outside the limits. Matches the MVP exactly: temperature,
 * systolic and diastolic flag at or above the high limit; pulse flags only
 * above it. Readings below a low limit always flag.
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
	return flags;
}
