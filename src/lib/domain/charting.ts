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
	// Federal minimum critical incidents (42 CFR 441.302(a)(6)); research/compliance-2026-10.md §1
	'Suspected abuse or neglect',
	'Suspected exploitation',
	'Death',
	'Other'
] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];
export type IncidentSeverity = 'Low' | 'Medium' | 'High';

export interface NotifyRule {
	who: 'Supervisor' | 'Family or guardian' | 'Nurse' | 'State reporting system';
	when: string;
	/** Hours after the incident when supervisors are reminded if not marked as told */
	hours?: number | null;
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
	/** Where staff report suspected abuse, neglect or exploitation themselves (state hotline), shown in the incident form. Empty: no number shown. */
	abuseHotline: string;
	/**
	 * Hours after the incident by which each contact must be marked as told,
	 * for reminders. null: no reminder (the written deadline still shows).
	 */
	guardianHours: number | null;
	nurseHours: number | null;
	stateHours: number | null;
}
export const RULE_HOURS_MAX = 720;
const SEVERITIES: readonly IncidentSeverity[] = ['Low', 'Medium', 'High'];
export const RULE_WHEN_MAX = 60;
export const ABUSE_HOTLINE_MAX = 120;

/**
 * Types where staff have a personal duty to report beyond this form. In most
 * states (CA, FL, MA, TX among them) a provider's incident report doesn't
 * satisfy a mandated reporter's own duty to call the abuse hotline or APS.
 */
export const MANDATED_REPORT_TYPES: readonly IncidentType[] = [
	'Suspected abuse or neglect',
	'Suspected exploitation'
];

/** The reminder shown in the incident form for those types, or null. */
export function mandatedReportNotice(type: IncidentType, rules: IncidentRules): string | null {
	if (!MANDATED_REPORT_TYPES.includes(type)) return null;
	const where = rules.abuseHotline
		? `Report it yourself too: ${rules.abuseHotline}.`
		: 'Report it yourself too, to your state’s abuse hotline or adult protective services. Ask your supervisor for the number.';
	return `If someone is in danger, call 911. This report doesn’t replace your own duty to report suspected abuse, neglect or exploitation. ${where}`;
}
export const DEFAULT_INCIDENT_RULES: IncidentRules = {
	guardianWhen: 'Within 24 hours',
	nurseTypes: ['Seizure', 'Medication error', 'Injury', 'Fall'],
	nurseWhen: 'Within 2 hours',
	stateSeverities: ['High'],
	stateTypes: [
		'Left without staff',
		'Suspected abuse or neglect',
		'Suspected exploitation',
		'Death'
	],
	stateWhen: "Check your state's deadline",
	abuseHotline: '',
	guardianHours: 24,
	nurseHours: 2,
	stateHours: null
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
		stateWhen: when(raw.stateWhen, d.stateWhen),
		abuseHotline:
			typeof raw.abuseHotline === 'string'
				? raw.abuseHotline.trim().slice(0, ABUSE_HOTLINE_MAX)
				: d.abuseHotline,
		guardianHours: hours(raw.guardianHours, d.guardianHours),
		nurseHours: hours(raw.nurseHours, d.nurseHours),
		stateHours: hours(raw.stateHours, d.stateHours)
	};
}

/** A whole number of hours, null to switch the reminder off, or the default. */
function hours(x: unknown, fallback: number | null): number | null {
	if (x === null) return null;
	return Number.isInteger(x) && (x as number) >= 1 && (x as number) <= RULE_HOURS_MAX
		? (x as number)
		: fallback;
}

/** Who must be told about an incident, and how soon, under the agency's rules. */
export function incidentNotifyRules(
	severity: IncidentSeverity,
	type: IncidentType,
	config: IncidentRules = DEFAULT_INCIDENT_RULES
): NotifyRule[] {
	const rules: NotifyRule[] = [
		{ who: 'Supervisor', when: 'Right away' },
		{ who: 'Family or guardian', when: config.guardianWhen, hours: config.guardianHours }
	];
	if (config.nurseTypes.includes(type)) {
		rules.push({ who: 'Nurse', when: config.nurseWhen, hours: config.nurseHours });
	}
	if (config.stateSeverities.includes(severity) || config.stateTypes.includes(type)) {
		rules.push({ who: 'State reporting system', when: config.stateWhen, hours: config.stateHours });
	}
	return rules;
}

/**
 * Incidents Lomi doesn't announce on the team board. A report of suspected
 * abuse, neglect or exploitation may concern a coworker who reads the board,
 * and reporters are kept confidential; a death is told by a supervisor.
 */
export const UNANNOUNCED_INCIDENT_TYPES: readonly IncidentType[] = [
	...MANDATED_REPORT_TYPES,
	'Death'
];

/**
 * Lomi's board post after an incident is filed (frontend-spec-2.md §3.6
 * "Post-submit"), or null for the types above. No person's name.
 */
export function incidentBoardText(
	authorName: string,
	type: IncidentType,
	severity: IncidentSeverity
): string | null {
	if (UNANNOUNCED_INCIDENT_TYPES.includes(type)) return null;
	const who = authorName.trim().split(/\s+/)[0] || 'A staff member';
	return `${who} reported an incident (${type.toLowerCase()}, ${severity.toLowerCase()} severity). A supervisor will follow up.`;
}
