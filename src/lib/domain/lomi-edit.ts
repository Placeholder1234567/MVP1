import { vagueFlags } from './lomi';

export const SHIFT_SECTIONS = ['activities', 'meals', 'mood', 'health'] as const;
export const BEHAVIOR_SECTIONS = ['before', 'behavior', 'response', 'outcome', 'duration'] as const;
export type DraftSection = (typeof SHIFT_SECTIONS)[number] | (typeof BEHAVIOR_SECTIONS)[number];
export interface GoalReference {
	goalId: string;
	evidence: string;
}

/** References identify observations to review, never trial outcomes or scores. */
export function groundedGoalReferences(
	value: unknown,
	goals: ReadonlyArray<{ id: string }>,
	observations: string
): GoalReference[] {
	if (!Array.isArray(value)) return [];
	const allowed = new Set(goals.map((g) => g.id));
	const seen = new Set<string>();
	const result: GoalReference[] = [];
	for (const item of value.slice(0, 100)) {
		if (!item || typeof item !== 'object') continue;
		const { goalId, evidence } = item;
		if (
			typeof goalId !== 'string' ||
			!allowed.has(goalId) ||
			seen.has(goalId) ||
			typeof evidence !== 'string' ||
			evidence.trim().length < 4 ||
			evidence.length > 1000 ||
			!observations.includes(evidence)
		)
			continue;
		seen.add(goalId);
		result.push({ goalId, evidence });
	}
	return result;
}

export interface SectionFlag {
	section: string;
	phrase: string;
	tip: string;
}
/** Vague wording still present in each section that the caregiver hasn't chosen to keep.
 * A flag clears when the phrase is edited out or the caregiver keeps it on purpose. */
export function openSectionFlags(
	content: Readonly<Record<string, string>>,
	kept: ReadonlySet<string> = new Set()
): SectionFlag[] {
	return Object.entries(content).flatMap(([section, text]) =>
		vagueFlags(text ?? '')
			.filter((flag) => !kept.has(flagKey(section, flag.phrase)))
			.map((flag) => ({ section, ...flag }))
	);
}
export const flagKey = (section: string, phrase: string) => `${section}:${phrase}`;

/** Where a flagged phrase sits in a section, so the review UI can select it. */
export function phraseRange(text: string, phrase: string): [number, number] | null {
	const start = text.toLowerCase().indexOf(phrase.toLowerCase());
	return start < 0 ? null : [start, start + phrase.length];
}

/**
 * Applies a proposal the caregiver accepted. Only sections already in the
 * draft can change, and the previous text is returned so the change can be undone.
 */
export function applyAcceptedUpdates(
	content: Readonly<Record<string, string>>,
	updates: ReadonlyArray<{ section: string; text: string }>
): { content: Record<string, string>; previous: Record<string, string> } {
	const next = { ...content };
	const previous: Record<string, string> = {};
	for (const { section, text } of updates) {
		if (!Object.hasOwn(content, section) || Object.hasOwn(previous, section)) continue;
		previous[section] = content[section];
		next[section] = text;
	}
	return { content: next, previous };
}
