// Case note categories (US-15): what a supervisor's case note is about, so the
// history can be read by kind (care coordination, ISP meetings, family calls).
export const CASE_NOTE_CATEGORIES = [
	'care_coordination',
	'isp_meeting',
	'family_contact',
	'other'
] as const;
export type CaseNoteCategory = (typeof CASE_NOTE_CATEGORIES)[number];

export const CASE_NOTE_CATEGORY_LABEL: Record<CaseNoteCategory, string> = {
	care_coordination: 'Care coordination',
	isp_meeting: 'ISP meeting',
	family_contact: 'Family contact',
	other: 'Other'
};

/** Label for a stored category; notes from before categories read "Other". */
export function caseNoteCategoryLabel(category: string | null | undefined): string {
	return CASE_NOTE_CATEGORY_LABEL[category as CaseNoteCategory] ?? CASE_NOTE_CATEGORY_LABEL.other;
}
