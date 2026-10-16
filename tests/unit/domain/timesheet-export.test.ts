import { expect, it } from 'vitest';
import { payrollCsv, type PayrollReport } from '../../../src/lib/domain/timesheet-export';

it('exports exact hours, stable references, UTC range and neutralized spreadsheet cells', () => {
	const report: PayrollReport = {
		version: 1,
		from: '2026-01-01T00:00:00.000Z',
		to: '2026-01-02T00:00:00.000Z',
		generatedAt: '2026-01-03T00:00:00.000Z',
		totals: { totalHours: 1.25, verifiedHours: 0, unverifiedHours: 0, manualHours: 1.25 },
		entries: [
			{
				id: 'entry',
				staffId: '=danger()',
				homeId: 'home',
				clockIn: '2026-01-01T00:00:00.000Z',
				clockOut: '2026-01-01T01:15:00.000Z',
				hours: 1.25,
				locationVerified: false,
				manual: true,
				acknowledged: false
			}
		]
	};
	const csv = payrollCsv(report);
	expect(csv.startsWith('\uFEFF')).toBe(true);
	expect(csv).toContain('"\'=danger()"');
	expect(csv).toContain('"1.25","No","Yes","No"');
	expect(csv).toContain(report.to);
});
