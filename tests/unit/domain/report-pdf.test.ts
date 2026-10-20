import { describe, expect, it } from 'vitest';
import type { ClinicalReport } from '../../../src/lib/domain/clinical-export';
import {
	clinicalPdfReport,
	fieldLabel,
	pdfCell,
	pdfText,
	tablePdfReport
} from '../../../src/lib/domain/report-pdf';

const report = (
	rows: ClinicalReport['rows'],
	extra: Partial<ClinicalReport> = {}
): ClinicalReport => ({
	version: 1,
	type: 'notes',
	fromDay: '2026-10-01',
	toDay: '2026-10-07',
	timeZone: 'America/Chicago',
	fromUtc: '2026-10-01T05:00:00.000Z',
	toUtcExclusive: '2026-10-08T05:00:00.000Z',
	generatedAt: '2026-10-08T12:00:00.000Z',
	dateBasis: 'Shift start calendar day',
	rows,
	...extra
});

describe('PDF report layout', () => {
	it('labels camelCase and snake_case columns as words', () => {
		expect(fieldLabel('occurredAt')).toBe('Occurred at');
		expect(fieldLabel('occurred_at')).toBe('Occurred at');
		expect(fieldLabel('id')).toBe('Id');
	});

	it('prints signature events one per line and other values like the CSV', () => {
		expect(
			pdfCell([
				{ action: 'submitted', byName: 'Cara', occurredAt: '2026-10-02T03:00:00.000Z' },
				{ action: 'approved', byName: null, occurredAt: '2026-10-02T09:00:00.000Z' }
			])
		).toBe('submitted · Cara · 2026-10-02T03:00:00.000Z\napproved · 2026-10-02T09:00:00.000Z');
		expect(pdfCell({ pulse: 89, bpSystolic: 120, note: null })).toBe('Pulse: 89\nBp systolic: 120');
		expect(pdfCell(null)).toBe('');
		expect(pdfCell(['a', 'b'])).toBe('["a","b"]');
		expect(pdfCell(new Date('2026-10-02T03:00:00Z'))).toBe('2026-10-02T03:00:00.000Z');
	});

	it('numbers records, keeps every column and states the period', () => {
		const pdf = clinicalPdfReport(report([{ id: 'n1', body: 'Ate lunch' }, { id: 'n2' }]));
		expect(pdf.title).toBe('Care records: notes');
		expect(pdf.intro[0]).toBe('2026-10-01 through 2026-10-07 (inclusive), America/Chicago');
		expect(pdf.sections).toHaveLength(1);
		expect(pdf.sections[0].records.map((r) => r.heading)).toEqual(['Record 1', 'Record 2']);
		expect(pdf.sections[0].records[1].fields).toEqual([
			['Id', 'n2'],
			['Body', '']
		]);
	});

	it('labels the current agency without claiming historical identity or changing source records', () => {
		const source = report([{ id: 'n1', body: 'Ate lunch' }]);
		const original = structuredClone(source);
		const pdf = clinicalPdfReport(source, 'Synthetic Care Agency');
		expect(pdf.intro[0]).toBe('Current agency name at generation: Synthetic Care Agency');
		expect(pdfText(pdf)).toContain(pdf.intro[0]);
		expect(pdf.intro[1]).toBe('2026-10-01 through 2026-10-07 (inclusive), America/Chicago');
		expect(source).toEqual(original);
		expect(pdf.sections).toEqual(clinicalPdfReport(source).sections);
	});

	it('puts the goal summary before the trial history', () => {
		const pdf = clinicalPdfReport(
			report([{ id: 't1' }], {
				type: 'goals',
				goalSummary: [{ goal: 'Brush teeth', trials: 3 } as never]
			})
		);
		expect(pdf.sections.map((s) => s.heading)).toEqual([
			'Goal progress summary',
			'Source trial history'
		]);
		expect(pdf.sections[0].records[0].fields).toContainEqual(['Trials', '3']);
	});

	it('lays out API rows in column order and lists all drawn text', () => {
		const pdf = tablePdfReport({
			type: 'incidents',
			from: '2026-10-01',
			to: '2026-10-02',
			timeZone: 'UTC',
			generatedAt: '2026-10-03T00:00:00.000Z',
			columns: ['incident_id', 'severity'],
			rows: [{ severity: 'high', incident_id: 'i1', extra: 'not a column' }]
		});
		expect(pdf.sections[0].records[0].fields).toEqual([
			['Incident id', 'i1'],
			['Severity', 'high']
		]);
		expect(pdfText(pdf)).toContain('high');
		expect(pdfText(pdf)).not.toContain('not a column');
	});
});
