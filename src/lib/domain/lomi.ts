// The MVP's conservative fallback: move the caregiver's own sentences into
// sections, without inventing facts or scoring goals from guesses.
export type NoteKind = 'shift' | 'behavior';
export interface DraftResult {
	content: Record<string, string>;
	flags: Array<{ phrase: string; tip: string }>;
	incident: { detected: boolean; summary: string };
	fallback: boolean;
	goalReferences?: Array<{ goalId: string; evidence: string }>;
}
const VAGUE = [
	'was fine',
	'was good',
	'was normal',
	'was bad',
	'acted out',
	'had an attitude',
	'had a bad attitude',
	'behaved',
	'was difficult',
	'was a handful'
];
const INCIDENT =
	/\b(fell|fall|slipped|slip|tripped|hurt|injur\w*|bleed\w*|bruise\w*|hospital|911|emergency|wrong med\w*|missed (his|her|their) med\w*|ran off|left the house|eloped|seizure)\b/i;
/** Vague or judgmental wording (ai-pipeline.md § Vague Language Detection). The
 * phrase stays in the note for the caregiver to fix or keep; Lomi never replaces it. */
/**
 * "Try covering" topics on the compose screen (frontend-spec-2.md §6,
 * "Contextual topic suggestions by shift time"; mvp app-caregiver.js .cv-try).
 * Reminders only, never inserted into the note.
 */
export function topicSuggestions(type: NoteKind, shift?: 'am' | 'pm' | 'on' | null): string[] {
	if (type === 'behavior') return ['Before', 'What happened', 'Your response', 'How it ended'];
	switch (shift) {
		case 'am':
			return ['Morning routine', 'Medications', 'Breakfast', 'Goals'];
		case 'pm':
			return ['Dinner', 'Evening meds', 'Activities', 'Mood'];
		case 'on':
			return ['Bed routine', 'Sleep', 'Checks', 'Incidents'];
		default:
			return ['Meals', 'Mood', 'Goals', 'Anything unusual'];
	}
}

export function vagueFlags(text: string): Array<{ phrase: string; tip: string }> {
	const low = text.toLowerCase();
	return VAGUE.filter((phrase) => low.includes(phrase)).map((phrase) => ({
		phrase,
		tip: `“${phrase}” is too vague for the record. Describe what you saw or heard.`
	}));
}
export function draftLocally(text: string, type: NoteKind): DraftResult {
	const sentences = text
		.replace(/\s+/g, ' ')
		.trim()
		.split(/(?<=[.!?])\s+/)
		.filter(Boolean);
	const flags = vagueFlags(text);
	const incident = {
		detected: INCIDENT.test(text),
		summary: sentences.find((s) => INCIDENT.test(s)) ?? ''
	};
	if (type === 'behavior')
		return {
			content: { before: '', behavior: text, response: '', outcome: '', duration: '' },
			flags,
			incident,
			fallback: true
		};
	const groups: Record<string, string[]> = { activities: [], meals: [], mood: [], health: [] };
	for (const sentence of sentences) {
		const section =
			INCIDENT.test(sentence) || /\b(med\w*|pain|sick|doctor|nurse|temperature)\b/i.test(sentence)
				? 'health'
				: /\b(ate|lunch|dinner|breakfast|snack|food|drank|meal)\b/i.test(sentence)
					? 'meals'
					: /\b(mood|happy|upset|fine|calm|smil\w*|angry|sad|laugh\w*|anxious|yell\w*)\b/i.test(
								sentence
						  )
						? 'mood'
						: 'activities';
		groups[section].push(sentence);
	}
	return {
		content: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.join(' ')])),
		flags,
		incident,
		fallback: true
	};
}
