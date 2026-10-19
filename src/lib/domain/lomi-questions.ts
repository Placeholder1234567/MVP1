// Lomi's follow-up questions on a draft (ai-pipeline.md "Proactive
// Questions"): after the draft renders, each empty or thin section gets a
// specific question, shown next to the box and in a short list. Worked out
// on the device from the draft itself, with no extra AI call. At most three
// at a time; answering one (or skipping it) brings up the next. Goal scores
// are asked on the goal step, never filled by Lomi (ai-pipeline.md Mode 3).

export interface LomiQuestion {
	section: string;
	text: string;
}

export const MAX_QUESTIONS = 3;
/** Activities shorter than this are "thin". */
const THIN_ACTIVITIES = 20;

/** The question for a section, in the order Lomi asks them. */
const QUESTIONS: [section: string, ask: (person: string) => string, thin?: number][] = [
	['activities', (p) => `Can you tell me more about what ${p} did today?`, THIN_ACTIVITIES],
	['meals', (p) => `Did ${p} eat their meals?`],
	['mood', (p) => `What was ${p}'s mood today?`],
	['health', () => 'Any health observations: vitals, medications, concerns?'],
	['before', () => 'What happened right before?'],
	['behavior', (p) => `What did ${p} do?`],
	['response', () => 'How did staff respond?'],
	['outcome', () => 'How did it end?'],
	['duration', () => 'How long did it last?']
];

/**
 * Questions for the draft's empty or thin sections, skipping any the
 * caregiver dismissed. Only sections the draft has are asked about.
 */
export function lomiQuestions(
	content: Record<string, string>,
	person: string,
	skipped: ReadonlySet<string> = new Set(),
	max = MAX_QUESTIONS
): LomiQuestion[] {
	const name = person.trim() || 'them';
	const out: LomiQuestion[] = [];
	for (const [section, ask, thin] of QUESTIONS) {
		if (!(section in content) || skipped.has(section)) continue;
		const text = (content[section] ?? '').trim();
		if (text.length === 0 || (thin && text.length < thin)) out.push({ section, text: ask(name) });
		if (out.length === max) break;
	}
	return out;
}
