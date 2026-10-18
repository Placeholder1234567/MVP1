import { describe, expect, it } from 'vitest';
import {
	DETAIL_TEXT_MAX,
	parseReportDetails,
	reportDetailRows,
	reportDetailsError
} from '../../../src/lib/domain/incident-details';

describe('parseReportDetails', () => {
	it('keeps known fields with allowed values and drops the rest', () => {
		expect(
			parseReportDetails({
				withStaff: 'Alone',
				restraint: 'Zip tie',
				selfInjury: 'Maybe',
				injuryAreas: ['Head', 'Head', 'Tail', 3],
				conditionNow: '  Resting  ',
				correctivePlan: '   ',
				extra: 'x'
			})
		).toEqual({ withStaff: 'Alone', injuryAreas: ['Head'], conditionNow: 'Resting' });
	});

	it('reads JSON strings from offline uploads and tolerates junk', () => {
		expect(parseReportDetails('{"medicationFactor":"Not known"}')).toEqual({
			medicationFactor: 'Not known'
		});
		expect(parseReportDetails('not json')).toEqual({});
		expect(parseReportDetails(null)).toEqual({});
		expect(parseReportDetails(['Head'])).toEqual({});
	});

	it('caps free text', () => {
		const long = parseReportDetails({ environmentFactors: 'a'.repeat(DETAIL_TEXT_MAX + 50) });
		expect(long.environmentFactors).toHaveLength(DETAIL_TEXT_MAX);
	});
});

describe('reportDetailsError', () => {
	it('needs a description for any restraint other than None', () => {
		expect(reportDetailsError({ restraint: 'Physical hold' })).toMatch(/Describe the restraint/);
		expect(reportDetailsError({ restraint: 'Physical hold', restraintDetail: 'Brief' })).toBeNull();
		expect(reportDetailsError({ restraint: 'None' })).toBeNull();
		expect(reportDetailsError({})).toBeNull();
	});
});

describe('reportDetailRows', () => {
	it('lists filled fields in form order with readable labels', () => {
		expect(
			reportDetailRows({
				correctivePlan: 'Move the rug',
				injuryAreas: ['Left arm', 'Face'],
				withStaff: 'With staff'
			})
		).toEqual([
			['Alone or with staff', 'With staff'],
			['Injury location', 'Left arm, Face'],
			['Corrective action plan', 'Move the rug']
		]);
	});
});
