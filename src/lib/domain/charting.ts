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
 * Who must be told about an incident, and how soon. Same rules as the MVP.
 * Placeholder: each agency must replace these with its state's actual
 * reporting rules and deadlines (mvp/README.md production checklist).
 */
export function incidentNotifyRules(severity: IncidentSeverity, type: IncidentType): NotifyRule[] {
	const rules: NotifyRule[] = [
		{ who: 'Supervisor', when: 'Right away' },
		{ who: 'Family or guardian', when: 'Within 24 hours' }
	];
	if (['Seizure', 'Medication error', 'Injury', 'Fall'].includes(type)) {
		rules.push({ who: 'Nurse', when: 'Within 2 hours' });
	}
	if (severity === 'High' || type === 'Left without staff') {
		rules.push({ who: 'State reporting system', when: "Check your state's deadline" });
	}
	return rules;
}
