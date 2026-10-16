import { expect, it } from 'vitest';
import {
	calendarDayStart,
	clinicalPeriod,
	clinicalCsv,
	clinicalHtml,
	type ClinicalReport
} from '../../../src/lib/domain/clinical-export';

it('uses inclusive local calendar days with 23-hour and 25-hour DST boundaries', () => {
	const spring = clinicalPeriod('2026-03-08', '2026-03-08', 'America/New_York');
	expect(spring.from.toISOString()).toBe('2026-03-08T05:00:00.000Z');
	expect(spring.to.toISOString()).toBe('2026-03-09T04:00:00.000Z');
	expect(spring.to.getTime() - spring.from.getTime()).toBe(23 * 3600000);
	const fall = clinicalPeriod('2026-11-01', '2026-11-01', 'America/New_York');
	expect(fall.to.getTime() - fall.from.getTime()).toBe(25 * 3600000);
	expect(calendarDayStart('2026-03-08', 'Asia/Kathmandu').toISOString()).toBe(
		'2026-03-07T18:15:00.000Z'
	);
});

it('rejects impossible, skipped, reversed and over-limit calendar dates', () => {
	for (const [from, to] of [
		['2026-02-30', '2026-03-01'],
		['2026-02-01', '2026-02-30'],
		['2026-03-02', '2026-03-01'],
		['2026-01-01', '2026-12-31']
	])
		expect(() => clinicalPeriod(from, to, 'UTC')).toThrow();
	expect(() => calendarDayStart('2011-12-30', 'Pacific/Apia')).toThrow();
});

it('neutralizes spreadsheet formulas and escapes active markup without losing Unicode', () => {
	const report: ClinicalReport = {
		version: 1,
		type: 'notes',
		fromDay: '2026-01-01',
		toDay: '2026-01-01',
		timeZone: 'UTC',
		fromUtc: '2026-01-01T00:00:00Z',
		toUtcExclusive: '2026-01-02T00:00:00Z',
		generatedAt: '2026-01-03T00:00:00Z',
		dateBasis: 'Shift day',
		rows: [{ clientName: '=HYPERLINK("x")', text: '<script>alert(1)</script> ሰላም & café' }]
	};
	expect(clinicalCsv(report)).toContain('"\'=HYPERLINK(""x"")"');
	const html = clinicalHtml(report);
	expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; ሰላም &amp; café');
	expect(html).not.toContain('<script>');
	expect(html).toContain("default-src 'none'");
	expect(html).not.toContain('No records');
});
