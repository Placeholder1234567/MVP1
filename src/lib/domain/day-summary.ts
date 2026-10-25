// Lomi daily summary (ai-pipeline.md "Task: summary"; trpc-router.md
// `lomi.summarize`). The server gathers a DaySnapshot for one home and day;
// Lomi writes 2-4 sentences from it, most important first. Without the model
// (not configured, rate limited or failing) the rules below write the same
// briefing from the counts, as the MVP does (app-main.js summary()).

export interface DaySnapshot {
	day: string;
	home: string;
	/** Scheduled shifts for the day with nobody assigned yet */
	openShifts: string[];
	coverage: { shift: string; status: string }[];
	notes: { person: string; type: string; status: string }[];
	/** People at the home with no note written for the day */
	missingNotes: string[];
	notesToReview: number;
	incidents: { person: string; type: string; severity: string }[];
	/** Doses recorded as refused or held */
	meds: { person: string; status: string }[];
	/** Scheduled doses whose time has passed with no record */
	dosesNotRecorded: number;
	healthAlerts: { person: string; alert: string }[];
	clockExceptions: number;
}

export interface DaySummary {
	summary: string;
	highlights: { text: string }[];
	/** "Suggested next steps": operational, from nextSteps() below, never the model */
	recommendations: NextStep[];
	fallback: boolean;
}

/** Where a next step is done in the app. */
export type NextStepPlace =
	'incidents' | 'health' | 'medications' | 'schedule' | 'notes' | 'review' | 'timesheets';

export interface NextStep {
	text: string;
	place: NextStepPlace;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Priority order: incidents, health alerts, refused or held doses, open shifts, missing notes, notes to review. */
export function fallbackSummary(s: DaySnapshot): string {
	const parts: string[] = [];
	if (s.incidents.length) parts.push(`${plural(s.incidents.length, 'incident')} open.`);
	if (s.healthAlerts.length)
		parts.push(`${plural(s.healthAlerts.length, 'health alert')} to follow up.`);
	if (s.meds.length) parts.push(`${plural(s.meds.length, 'dose')} refused or held.`);
	if (s.dosesNotRecorded)
		parts.push(`${plural(s.dosesNotRecorded, 'scheduled dose')} not recorded yet.`);
	if (s.openShifts.length) parts.push(`${plural(s.openShifts.length, 'shift')} still open.`);
	if (s.missingNotes.length) parts.push(`Notes still missing for ${s.missingNotes.join(', ')}.`);
	if (s.notesToReview) parts.push(`${plural(s.notesToReview, 'note')} waiting for review.`);
	if (s.clockExceptions) parts.push(`${plural(s.clockExceptions, 'clock exception')} to check.`);
	return parts.length ? parts.map(sentence).join(' ') : 'Nothing needs follow-up right now.';
}

/**
 * Suggested next steps for the supervisor, from fixed templates over the
 * day's counts. Deliberately operational (review, staff, record, check),
 * never clinical: Guad is not clinical decision support (prd.md non-goal 4;
 * supervisors and direct-support staff are mostly not licensed clinicians,
 * so FDA's clinician-support exemption wouldn't cover advice to them).
 * The model never writes these. Highest priority first, at most `limit`.
 */
export function nextSteps(s: DaySnapshot, limit = 3): NextStep[] {
	const steps: NextStep[] = [];
	if (s.incidents.length)
		steps.push({
			text: `Review ${plural(s.incidents.length, 'open incident')}`,
			place: 'incidents'
		});
	if (s.healthAlerts.length)
		steps.push({
			text: `Look at ${plural(s.healthAlerts.length, 'health reading')} flagged outside the agency’s range`,
			place: 'health'
		});
	if (s.dosesNotRecorded)
		steps.push({
			text: `Check ${plural(s.dosesNotRecorded, 'scheduled dose')} with no record yet`,
			place: 'medications'
		});
	if (s.meds.length)
		steps.push({
			text: `Confirm ${plural(s.meds.length, 'refused or held dose')} ${s.meds.length === 1 ? 'was' : 'were'} reported as your procedure requires`,
			place: 'medications'
		});
	const searching = s.coverage.filter((c) => c.status === 'searching').length;
	if (s.openShifts.length)
		steps.push({
			text: `Fill ${plural(s.openShifts.length, 'open shift')}${searching ? ` (${searching} looking for cover)` : ''}`,
			place: 'schedule'
		});
	if (s.missingNotes.length)
		steps.push({
			text: `Remind staff: no note yet for ${s.missingNotes.slice(0, 3).join(', ')}${s.missingNotes.length > 3 ? ` and ${s.missingNotes.length - 3} more` : ''}`,
			place: 'notes'
		});
	if (s.notesToReview)
		steps.push({ text: `Review ${plural(s.notesToReview, 'submitted note')}`, place: 'review' });
	if (s.clockExceptions)
		steps.push({
			text: `Check ${plural(s.clockExceptions, 'clock record')} needing review`,
			place: 'timesheets'
		});
	return steps.slice(0, limit);
}

/** Strips markdown the briefing must not contain (headings, bullets, emphasis). */
export function plainBriefing(text: string): string {
	return text
		.split('\n')
		.map((line) =>
			line
				.replace(/^\s*(#{1,6}\s+|[-*•]\s+|\d+[.)]\s+)/, '')
				.replace(/\*\*(.+?)\*\*/g, '$1')
				.trim()
		)
		.filter(Boolean)
		.join(' ')
		.replace(/\s{2,}/g, ' ')
		.trim();
}

// Wording that turns a briefing into clinical advice (research/product-2026-10.md
// §D "Forbidden content"): a suggestion verb near a clinical action, or a
// diagnosis. Facts such as "2 doses were refused" don't match.
const ADVICE =
	/\b(should|must|recommend(?:s|ed)?|consider(?:ing)?|suggest(?:s|ed)?|advise[sd]?|try|please)\b[^.!?]{0,80}\b(give|giving|administer(?:ing)?|dos(?:e|es|age|ing)|medicat(?:e|ion|ions)|mg|prn|increase|decrease|reduce|double|start(?:ing)?|stop(?:ping)?|withhold|treat(?:ing|ment)?|therapy|antibiotics?|ibuprofen|acetaminophen|tylenol|insulin|fluids?|diet)\b/i;
const DIAGNOSIS =
	/\b(diagnos(?:is|e|ed|ing)|(?:likely|probably|possibly|may|might|could) (?:have|has|(?:be )?having) (?:a |an )?(?:infection|uti|pneumonia|sepsis|stroke|dehydration|seizure disorder|flu|covid)|(?:is|are) (?:septic|dehydrated|having a stroke))\b/i;

/** Whether model text gives clinical advice or a diagnosis rather than stating facts. */
export function isClinicalAdvice(text: string): boolean {
	return ADVICE.test(text) || DIAGNOSIS.test(text);
}
