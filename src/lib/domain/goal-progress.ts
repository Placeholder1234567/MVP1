import { isPromptLevel } from './charting';

export interface GoalProgressSummary extends Record<string, unknown> {
	goalId: string;
	clientId: string;
	clientName: string;
	currentGoalArea: string;
	currentGoalText: string;
	records: number;
	notAttemptedRecords: number;
	emptyAttemptRecords: number;
	recordedTrials: number;
	independentTrials: number;
	refusedTrials: number;
	unknownTrials: number;
	ignoredTrialsOnNotAttempted: number;
	independentPercent: number | null;
}

/** Counts only source trials, never inferred support, missed days or target attainment. */
export function goalProgress(rows: ReadonlyArray<Record<string, unknown>>): GoalProgressSummary[] {
	const groups = new Map<string, GoalProgressSummary>();
	for (const row of rows) {
		const goalId = String(row.goalId);
		let group = groups.get(goalId);
		if (!group) {
			group = {
				goalId,
				clientId: String(row.clientId),
				clientName: String(row.clientName ?? ''),
				currentGoalArea: String(row.currentGoalArea ?? ''),
				currentGoalText: String(row.currentGoalText ?? ''),
				records: 0,
				notAttemptedRecords: 0,
				emptyAttemptRecords: 0,
				recordedTrials: 0,
				independentTrials: 0,
				refusedTrials: 0,
				unknownTrials: 0,
				ignoredTrialsOnNotAttempted: 0,
				independentPercent: null
			};
			groups.set(goalId, group);
		}
		const trials = Array.isArray(row.trials) ? row.trials : [];
		group.records++;
		if (row.notAttempted === true) {
			group.notAttemptedRecords++;
			group.ignoredTrialsOnNotAttempted += trials.length;
			continue;
		}
		if (!trials.length) group.emptyAttemptRecords++;
		group.recordedTrials += trials.length;
		group.independentTrials += trials.filter((t) => t === 'Independent').length;
		group.refusedTrials += trials.filter((t) => t === 'Refused').length;
		group.unknownTrials += trials.filter((t) => typeof t !== 'string' || !isPromptLevel(t)).length;
	}
	for (const group of groups.values())
		group.independentPercent = group.recordedTrials
			? Math.round((group.independentTrials / group.recordedTrials) * 100)
			: null;
	return [...groups.values()];
}
