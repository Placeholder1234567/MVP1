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
	recommendations: { text: string }[];
	fallback: boolean;
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
