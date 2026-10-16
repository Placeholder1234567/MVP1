import { expect, it } from 'vitest';
import { goalProgress } from '../../../src/lib/domain/goal-progress';
import {
	clinicalCsv,
	clinicalHtml,
	type ClinicalReport
} from '../../../src/lib/domain/clinical-export';

it('weights source trials rather than averaging sessions; refusal remains in denominator', () => {
	const [summary] = goalProgress([
		{
			goalId: 'g',
			clientId: 'c',
			trials: ['Independent', 'Verbal prompt', 'Refused'],
			notAttempted: false
		},
		{ goalId: 'g', clientId: 'c', trials: ['Independent'], notAttempted: false },
		{ goalId: 'g', clientId: 'c', trials: [], notAttempted: true }
	]);
	expect(summary).toMatchObject({
		records: 3,
		recordedTrials: 4,
		independentTrials: 2,
		refusedTrials: 1,
		independentPercent: 50,
		notAttemptedRecords: 1,
		emptyAttemptRecords: 0
	});
});

it('separates no-data, unknown codes and inconsistent not-attempted trials without inventing success', () => {
	const summaries = goalProgress([
		{ goalId: 'a', trials: [], notAttempted: false },
		{ goalId: 'a', trials: ['Independent'], notAttempted: true },
		{ goalId: 'b', trials: ['Independent', 'Imported unknown code'], notAttempted: false }
	]);
	expect(summaries[0]).toMatchObject({
		recordedTrials: 0,
		independentPercent: null,
		notAttemptedRecords: 1,
		emptyAttemptRecords: 1,
		ignoredTrialsOnNotAttempted: 1
	});
	expect(summaries[1]).toMatchObject({
		recordedTrials: 2,
		unknownTrials: 1,
		independentPercent: 50
	});
	expect(goalProgress([])).toEqual([]);
});

it('includes summary and traceable source history in escaped CSV and print formats', () => {
	const rows = [
		{
			goalId: 'g',
			clientId: 'c',
			currentGoalText: '=Synthetic goal <script>x</script> ሰላም',
			noteId: 'signed-note',
			trials: ['Independent']
		}
	];
	const report: ClinicalReport = {
		version: 1,
		type: 'goals',
		fromDay: '2026-03-08',
		toDay: '2026-03-08',
		fromUtc: '2026-03-08T05:00:00Z',
		toUtcExclusive: '2026-03-09T04:00:00Z',
		generatedAt: '2026-03-10T00:00:00Z',
		timeZone: 'America/New_York',
		dateBasis: 'Shift day; definitions current',
		rows,
		goalSummary: goalProgress(rows)
	};
	const csv = clinicalCsv(report);
	expect(csv).toContain('Goal progress summary');
	expect(csv).toContain('Source trial history');
	expect(csv).toContain('"\'=Synthetic goal');
	expect(csv).toContain('signed-note');
	const html = clinicalHtml(report);
	expect(html).toContain('Goal progress summary');
	expect(html).toContain('&lt;script&gt;x&lt;/script&gt; ሰላም');
	expect(html).not.toContain('<script>');
});
