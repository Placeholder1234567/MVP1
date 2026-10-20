// What a PDF report shows, apart from how it is drawn (server/pdf.ts draws it).
// Records print as label/value pairs, like the print-ready HTML, so a PDF reads
// the same as the other formats of the same report.
import { clinicalCell, clinicalColumns, type ClinicalReport } from './clinical-export';

export interface PdfRecord {
	heading: string;
	fields: [label: string, value: string][];
}
export interface PdfSection {
	heading?: string;
	records: PdfRecord[];
}
export interface PdfReport {
	title: string;
	intro: string[];
	sections: PdfSection[];
	/** Shown in place of the records when there are none. */
	empty: string;
}

/** `occurredAt` / `occurred_at` -> `Occurred at`. */
export function fieldLabel(key: string): string {
	const words = key
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/_/g, ' ')
		.trim()
		.toLowerCase();
	return words.charAt(0).toUpperCase() + words.slice(1);
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date);

/**
 * A cell as text. Objects (vital readings) print as "Label: value" lines and
 * lists of objects (signature events) one per line, instead of as JSON;
 * everything else matches the CSV and HTML.
 */
export function pdfCell(v: unknown): string {
	if (isPlainObject(v))
		return Object.entries(v)
			.filter(([, x]) => x != null && x !== '')
			.map(([k, x]) => `${fieldLabel(k)}: ${clinicalCell(x)}`)
			.join('\n');
	if (Array.isArray(v) && v.length && v.every(isPlainObject))
		return v.map((o) => Object.values(o).map(clinicalCell).filter(Boolean).join(' · ')).join('\n');
	return clinicalCell(v);
}

const record = (heading: string, row: Record<string, unknown>, columns: string[]): PdfRecord => ({
	heading,
	fields: columns.map((k) => [fieldLabel(k), pdfCell(row[k])])
});

export const CONFIDENTIAL =
	'Contains confidential care information; keep in approved agency storage.';

export function clinicalPdfReport(report: ClinicalReport, agencyName?: string): PdfReport {
	const columns = clinicalColumns(report.rows);
	const sections: PdfSection[] = [];
	if (report.goalSummary) {
		const summary = clinicalColumns(report.goalSummary);
		sections.push({
			heading: 'Goal progress summary',
			records: report.goalSummary.map((r, i) => record(`Goal ${i + 1}`, r, summary))
		});
	}
	sections.push({
		heading: report.goalSummary ? 'Source trial history' : undefined,
		records: report.rows.map((r, i) => record(`Record ${i + 1}`, r, columns))
	});
	return {
		title: `Care records: ${report.type}`,
		intro: [
			...(agencyName === undefined ? [] : [`Current agency name at generation: ${agencyName}`]),
			`${report.fromDay} through ${report.toDay} (inclusive), ${report.timeZone}`,
			`${report.dateBasis}. Generated ${report.generatedAt}. ${report.rows.length} records.`,
			'Authoritative records; no draft notes. This report is not a new signature or an approval.',
			CONFIDENTIAL
		],
		sections,
		empty: 'No records in this period.'
	};
}

/** API reports (openapi.yaml /reports/{type}): one record per row, columns in order. */
export function tablePdfReport(input: {
	type: string;
	from: string;
	to: string;
	timeZone: string;
	generatedAt: string;
	columns: readonly string[];
	rows: Record<string, unknown>[];
}): PdfReport {
	return {
		title: `Report: ${input.type}`,
		intro: [
			`${input.from} through ${input.to} (inclusive), ${input.timeZone}`,
			`Generated ${input.generatedAt}. ${input.rows.length} records.`,
			CONFIDENTIAL
		],
		sections: [
			{
				records: input.rows.map((r, i) => record(`Record ${i + 1}`, r, [...input.columns]))
			}
		],
		empty: 'No records in this period.'
	};
}

/** Every string the PDF will draw, for the font coverage check. */
export function pdfText(report: PdfReport): string[] {
	return [
		report.title,
		report.empty,
		...report.intro,
		...report.sections.flatMap((s) => [
			s.heading ?? '',
			...s.records.flatMap((r) => [r.heading, ...r.fields.flat()])
		])
	];
}
