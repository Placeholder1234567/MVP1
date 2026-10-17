// Charting preset labels and section order (charting-ux.md §2). The preset
// changes words and form order only, never schema, API or validation
// (CLAUDE.md). Terms follow the spec's label map; casing follows the MVP's
// sentence case for the default preset ("Shift note"), Therap's own terms as is.

export type NoteSection = 'activities' | 'meals' | 'mood' | 'health' | 'goals';

export function chartingLabels(preset: string | null | undefined) {
	return preset === 'therap'
		? {
				shift: 'T-Log',
				behavior: 'GER',
				/** Goal section inside a note */
				goals: 'ISP Data Collection',
				/** Goal tracking header on a person's page and in review */
				goalsNav: 'ISP Data',
				medications: 'eMAR',
				incident: 'GER (Incident)',
				reportIncident: 'Report a GER',
				approve: 'Approve T-Log',
				sendBack: 'Return T-Log',
				/** General info header, then Activities, ISP Data, Health, Meals, Mood */
				shiftOrder: ['activities', 'goals', 'health', 'meals', 'mood'] as NoteSection[]
			}
		: {
				shift: 'Shift note',
				behavior: 'Behavior note',
				goals: 'Goal tracking',
				goalsNav: 'Goals',
				medications: 'Medications',
				incident: 'Incident report',
				reportIncident: 'Report an incident',
				approve: 'Approve note',
				sendBack: 'Send back',
				shiftOrder: ['activities', 'meals', 'mood', 'health', 'goals'] as NoteSection[]
			};
}
