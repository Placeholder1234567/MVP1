// Charting constants shared by the device and the server (ported from the MVP:
// mvp/src/prompts.js LEVELS, mvp/src/app-core.js SERVICES and notifRules).

/** Prompt levels for goal trials, least to most support. */
export const PROMPT_LEVELS = [
	'Independent',
	'Verbal prompt',
	'Gestural prompt',
	'Model',
	'Partial physical',
	'Full physical',
	'Refused'
] as const;
export type PromptLevel = (typeof PROMPT_LEVELS)[number];

export function isPromptLevel(v: string): v is PromptLevel {
	return (PROMPT_LEVELS as readonly string[]).includes(v);
}

/** "3 of 4 independent", the MVP's goal score line. */
export function trialScore(trials: string[]): string {
	if (!trials.length) return '';
	const independent = trials.filter((t) => t === 'Independent').length;
	return `${independent} of ${trials.length} independent`;
}

/**
 * A goal milestone worth celebrating (frontend-spec-3.md §13 item 40): every
 * trial this shift was Independent. One trial is too little to call it.
 */
export function goalMilestone(trials: string[]): boolean {
	return trials.length >= 2 && trials.every((t) => t === 'Independent');
}

/** Daily services for attendance (billing). */
export const ATTENDANCE_SERVICES = [
	'In-home support',
	'Day program',
	'Community outing',
	'Employment support',
	'Absent: hospital',
	'Absent: family visit'
] as const;

export const INCIDENT_TYPES = [
	'Seizure',
	'Medication error',
	'Injury',
	'Fall',
	'Left without staff',
	'Behavior with harm',
	'Property damage',
	'Other'
] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];
export type IncidentSeverity = 'Low' | 'Medium' | 'High';

export interface NotifyRule {
	who: 'Supervisor' | 'Family or guardian' | 'Nurse' | 'State reporting system';
	when: string;
}

/**
 * An agency's incident reporting rules (frontend-audit.md finding 8): who
 * beyond the supervisor must be told, for which incidents, and by when.
 * Stored in agencies.settings.incident_rules; the defaults are the MVP's
 * placeholder rules until an admin enters their state's.
 */
export interface IncidentRules {
	guardianWhen: string;
	nurseTypes: IncidentType[];
	nurseWhen: string;
	stateSeverities: IncidentSeverity[];
	stateTypes: IncidentType[];
	stateWhen: string;
}
const SEVERITIES: readonly IncidentSeverity[] = ['Low', 'Medium', 'High'];
export const RULE_WHEN_MAX = 60;
export const DEFAULT_INCIDENT_RULES: IncidentRules = {
	guardianWhen: 'Within 24 hours',
	nurseTypes: ['Seizure', 'Medication error', 'Injury', 'Fall'],
	nurseWhen: 'Within 2 hours',
	stateSeverities: ['High'],
	stateTypes: ['Left without staff'],
	stateWhen: "Check your state's deadline"
};

/** The agency's rules from its settings; any missing or invalid part keeps the default. */
export function parseIncidentRules(settings: unknown): IncidentRules {
	let v = settings;
	if (typeof v === 'string') {
		try {
			v = JSON.parse(v);
		} catch {
			v = {};
		}
	}
	const raw = (
		v && typeof v === 'object' ? (v as Record<string, unknown>).incident_rules : null
	) as Record<string, unknown> | null | undefined;
	if (!raw || typeof raw !== 'object') return DEFAULT_INCIDENT_RULES;
	const d = DEFAULT_INCIDENT_RULES;
	const when = (x: unknown, fallback: string) =>
		typeof x === 'string' && x.trim() ? x.trim().slice(0, RULE_WHEN_MAX) : fallback;
	const list = <T extends string>(x: unknown, allowed: readonly T[], fallback: T[]): T[] =>
		Array.isArray(x) ? allowed.filter((a) => x.includes(a)) : fallback;
	return {
		guardianWhen: when(raw.guardianWhen, d.guardianWhen),
		nurseTypes: list(raw.nurseTypes, INCIDENT_TYPES, d.nurseTypes),
		nurseWhen: when(raw.nurseWhen, d.nurseWhen),
		stateSeverities: list(raw.stateSeverities, SEVERITIES, d.stateSeverities),
		stateTypes: list(raw.stateTypes, INCIDENT_TYPES, d.stateTypes),
		stateWhen: when(raw.stateWhen, d.stateWhen)
	};
}

/** Who must be told about an incident, and how soon, under the agency's rules. */
export function incidentNotifyRules(
	severity: IncidentSeverity,
	type: IncidentType,
	config: IncidentRules = DEFAULT_INCIDENT_RULES
): NotifyRule[] {
	const rules: NotifyRule[] = [
		{ who: 'Supervisor', when: 'Right away' },
		{ who: 'Family or guardian', when: config.guardianWhen }
	];
	if (config.nurseTypes.includes(type)) {
		rules.push({ who: 'Nurse', when: config.nurseWhen });
	}
	if (config.stateSeverities.includes(severity) || config.stateTypes.includes(type)) {
		rules.push({ who: 'State reporting system', when: config.stateWhen });
	}
	return rules;
}
