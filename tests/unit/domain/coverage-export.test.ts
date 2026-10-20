import { expect, it } from 'vitest';
import {
	coverageCsv,
	COVERAGE_EVIDENCE_LIMITS,
	type CoverageReport
} from '../../../src/lib/domain/coverage-export';

it('keeps evidence limits in empty exports and distinguishes eligibility from send evidence', () => {
	const report: CoverageReport = {
		version: 2,
		type: 'coverage',
		homeId: 'home',
		fromDay: '2026-03-08',
		toDay: '2026-03-08',
		timeZone: 'America/New_York',
		generatedAt: '2026-03-09T00:00:00Z',
		notificationVisibility: 'own_recipient_only',
		offerEvidenceVisibility: 'selected_home_prospective',
		dateBasis: 'Shift start day',
		evidenceLimits: COVERAGE_EVIDENCE_LIMITS,
		rows: []
	};
	expect(coverageCsv(report)).toContain('own_recipient_only');
	expect(coverageCsv(report)).toContain('Eligibility is not proof an offer was sent');
	expect(coverageCsv(report)).toContain('Missing evidence is unknown');
	expect(coverageCsv(report)).toContain('provider_accepted is not device delivery');
	report.rows = [
		{
			kind: 'candidate',
			id: 'candidate',
			requestId: 'request',
			eligible: true,
			staffName: '=HYPERLINK("unsafe")',
			reason: '@formula'
		}
	];
	const csv = coverageCsv(report);
	expect(csv).toContain('"\'=HYPERLINK(""unsafe"")"');
	expect(csv).toContain('"\'@formula"');
	expect(csv).toContain('"true"');
	expect(csv).not.toContain('"Offered"');
});
