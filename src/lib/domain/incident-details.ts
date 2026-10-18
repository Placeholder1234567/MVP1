// Optional incident details that many state IDD incident reports ask for
// (frontend-audit.md finding 8), kept in incidents.report_details. All
// optional: agencies whose state needs them fill them in; nothing else
// changes for those that don't.

export const WITH_STAFF = ['With staff', 'Alone', 'Not known'] as const;
export const RESTRAINT = [
	'None',
	'Physical hold',
	'Mechanical',
	'Medication (chemical)',
	'Other'
] as const;
export const YES_NO = ['Yes', 'No'] as const;
export const YES_NO_UNKNOWN = ['Yes', 'No', 'Not known'] as const;
/** Injury locations, the accessible stand-in for a body map. */
export const BODY_AREAS = [
	'Head',
	'Face',
	'Neck',
	'Chest',
	'Abdomen',
	'Back',
	'Left arm',
	'Right arm',
	'Left hand',
	'Right hand',
	'Left leg',
	'Right leg',
	'Left foot',
	'Right foot',
	'Other'
] as const;
export const DETAIL_TEXT_MAX = 2000;

export interface ReportDetails {
	conditionNow?: string;
	withStaff?: (typeof WITH_STAFF)[number];
	restraint?: (typeof RESTRAINT)[number];
	restraintDetail?: string;
	selfInjury?: (typeof YES_NO)[number];
	injuryAreas?: (typeof BODY_AREAS)[number][];
	medicationFactor?: (typeof YES_NO_UNKNOWN)[number];
	environmentFactors?: string;
	correctivePlan?: string;
}

const pick = <T extends readonly string[]>(options: T, v: unknown): T[number] | undefined =>
	typeof v === 'string' && (options as readonly string[]).includes(v)
		? (v as T[number])
		: undefined;
const words = (v: unknown) =>
	typeof v === 'string' && v.trim() ? v.trim().slice(0, DETAIL_TEXT_MAX) : undefined;

/** Known fields with allowed values only; anything else is dropped (offline uploads, old rows). */
export function parseReportDetails(value: unknown): ReportDetails {
	let v = value;
	if (typeof v === 'string') {
		try {
			v = JSON.parse(v);
		} catch {
			return {};
		}
	}
	const r = (typeof v === 'object' && v && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
	const areas = Array.isArray(r.injuryAreas)
		? [...new Set(r.injuryAreas.map((a) => pick(BODY_AREAS, a)).filter((a) => a !== undefined))]
		: [];
	const out: ReportDetails = {
		conditionNow: words(r.conditionNow),
		withStaff: pick(WITH_STAFF, r.withStaff),
		restraint: pick(RESTRAINT, r.restraint),
		restraintDetail: words(r.restraintDetail),
		selfInjury: pick(YES_NO, r.selfInjury),
		injuryAreas: areas.length ? areas : undefined,
		medicationFactor: pick(YES_NO_UNKNOWN, r.medicationFactor),
		environmentFactors: words(r.environmentFactors),
		correctivePlan: words(r.correctivePlan)
	};
	return Object.fromEntries(Object.entries(out).filter(([, x]) => x !== undefined));
}

/** Why the details can't be saved, or null. A restraint must be described. */
export function reportDetailsError(d: ReportDetails): string | null {
	if (d.restraint && d.restraint !== 'None' && !d.restraintDetail)
		return 'Describe the restraint or restrictive intervention: what, how long, and who.';
	return null;
}

export const REPORT_DETAIL_LABELS: Record<keyof ReportDetails, string> = {
	conditionNow: 'Condition now',
	withStaff: 'Alone or with staff',
	restraint: 'Restraint or restrictive intervention',
	restraintDetail: 'Restraint details',
	selfInjury: 'Self-injurious behavior',
	injuryAreas: 'Injury location',
	medicationFactor: 'Medication a factor',
	environmentFactors: 'Environmental factors',
	correctivePlan: 'Corrective action plan'
};

/** Label/value pairs for review screens and exports, in form order. */
export function reportDetailRows(d: ReportDetails): [string, string][] {
	return (Object.keys(REPORT_DETAIL_LABELS) as (keyof ReportDetails)[]).flatMap((k) => {
		const v = d[k];
		if (v === undefined) return [];
		return [[REPORT_DETAIL_LABELS[k], Array.isArray(v) ? v.join(', ') : v]];
	});
}

// ─── Witnesses (frontend-audit.md finding 8: names and roles) ─────────────

export const WITNESS_ROLES = ['Staff', 'Person supported', 'Family or visitor', 'Other'] as const;
export type WitnessRole = (typeof WITNESS_ROLES)[number];
export interface Witness {
	name: string;
	role: WitnessRole;
}
export const WITNESS_NAME_MAX = 100;
export const WITNESSES_MAX = 10;

/** Witnesses with a name and a known role; blanks and anything else are dropped. */
export function parseWitnessList(value: unknown): Witness[] {
	let v = value;
	if (typeof v === 'string') {
		try {
			v = JSON.parse(v);
		} catch {
			return [];
		}
	}
	if (!Array.isArray(v)) return [];
	return v
		.flatMap((w) => {
			if (!w || typeof w !== 'object') return [];
			const r = w as Record<string, unknown>;
			const name = typeof r.name === 'string' ? r.name.trim().slice(0, WITNESS_NAME_MAX) : '';
			const role = (WITNESS_ROLES as readonly unknown[]).includes(r.role)
				? (r.role as WitnessRole)
				: 'Other';
			return name ? [{ name, role }] : [];
		})
		.slice(0, WITNESSES_MAX);
}

/** "Dev Okafor (Staff); Ann Lee (Family or visitor)", the readable copy kept in `witnesses`. */
export const witnessText = (list: readonly Witness[]) =>
	list.map((w) => `${w.name} (${w.role})`).join('; ');
