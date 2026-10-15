export function chartingLabels(preset: string | null | undefined) {
	return preset === 'therap'
		? {
				shift: 'T-Log',
				behavior: 'Behavior T-Log',
				goals: 'ISP Data',
				medications: 'eMAR',
				incident: 'GER'
			}
		: {
				shift: 'Shift note',
				behavior: 'Behavior note',
				goals: 'Goals',
				medications: 'Medications',
				incident: 'Incident report'
			};
}
