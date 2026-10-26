import { addDays } from './time';
import { csvRows } from './csv';
import type { GoalProgressSummary } from './goal-progress';

export const CLINICAL_TYPES = [
	'notes',
	'mar',
	'health',
	'incidents',
	'attendance',
	'goals'
] as const;
export type ClinicalType = (typeof CLINICAL_TYPES)[number];

/** The plan feature each care report needs, on top of `reports` (entitlements.md). */
export const CLINICAL_TYPE_FEATURE = {
	notes: 'charting',
	mar: 'mar',
	health: 'health',
	incidents: 'incidents',
	attendance: 'charting',
	goals: 'goals'
} as const satisfies Record<ClinicalType, string>;
export type ClinicalRow = Record<string, unknown>;
export interface ClinicalReport {
	version: 1;
	type: ClinicalType;
	fromDay: string;
	toDay: string;
	timeZone: string;
	fromUtc: string;
	toUtcExclusive: string;
	generatedAt: string;
	dateBasis: string;
	rows: ClinicalRow[];
	goalSummary?: GoalProgressSummary[];
}

/** Earliest instant in a calendar day, including DST and midnight offset changes. */
export function calendarDayStart(day: string, timeZone: string): Date {
	if (
		!/^\d{4}-\d{2}-\d{2}$/.test(day) ||
		new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) !== day
	)
		throw new Error('Invalid report date');
	const formatter = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	});
	const localDay = (at: number) => {
		const p = formatter.formatToParts(at);
		return ['year', 'month', 'day'].map((k) => p.find((v) => v.type === k)?.value).join('-');
	};
	const noon = new Date(`${day}T12:00:00Z`).getTime();
	let low = noon - 36 * 3600000,
		high = noon + 36 * 3600000;
	while (low < high) {
		const mid = Math.floor((low + high) / 2);
		if (localDay(mid) < day) low = mid + 1;
		else high = mid;
	}
	if (localDay(low) !== day) throw new Error('Report date does not exist in agency time zone');
	return new Date(low);
}

export function clinicalPeriod(fromDay: string, toDay: string, timeZone: string) {
	const from = calendarDayStart(fromDay, timeZone);
	calendarDayStart(toDay, timeZone);
	const to = calendarDayStart(addDays(toDay, 1), timeZone);
	const days = (Date.parse(`${toDay}T12:00Z`) - Date.parse(`${fromDay}T12:00Z`)) / 86400000 + 1;
	if (!Number.isFinite(days) || days < 1 || days > 93)
		throw new Error('Choose one to 93 calendar days');
	return { from, to };
}

export const clinicalCell = (v: unknown): string =>
	v == null
		? ''
		: typeof v === 'string'
			? v
			: v instanceof Date
				? v.toISOString()
				: JSON.stringify(v);
export const clinicalColumns = (rows: ClinicalRow[]) => [
	...new Set(rows.flatMap((r) => Object.keys(r)))
];
export function clinicalCsv(report: ClinicalReport) {
	const columns = clinicalColumns(report.rows);
	const summaryColumns = clinicalColumns(report.goalSummary ?? []);
	return (
		'\uFEFF' +
		csvRows([
			['Report type', 'Period from', 'Period to (inclusive)', 'Agency time zone', 'Date basis'],
			[report.type, report.fromDay, report.toDay, report.timeZone, report.dateBasis],
			[],
			...(report.goalSummary
				? [
						['Goal progress summary'],
						summaryColumns,
						...report.goalSummary.map((r) => summaryColumns.map((k) => clinicalCell(r[k]))),
						[],
						['Source trial history']
					]
				: []),
			columns,
			...report.rows.map((r) => columns.map((k) => clinicalCell(r[k])))
		])
	);
}
export const escapeReportHtml = (v: unknown) =>
	clinicalCell(v)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
export function clinicalHtml(report: ClinicalReport) {
	const esc = escapeReportHtml,
		columns = clinicalColumns(report.rows);
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer"><title>Guad care report</title><style>body{font:14px system-ui,sans-serif;color:#172c27;margin:28px}h1{font-size:25px}article{border-top:2px solid #52645e;padding-top:12px;margin-top:24px}h2{font-size:18px}dl{display:grid;grid-template-columns:minmax(100px,180px) minmax(0,1fr);gap:8px 16px}dt{font-weight:600}dd{margin:0;overflow-wrap:anywhere;white-space:pre-wrap}.hint{color:#52645e}@media print{.hint{display:none}h2{break-after:avoid}dt{break-after:avoid}@page{margin:15mm}}</style></head><body><h1>Care records: ${esc(report.type)}</h1><p>${esc(report.fromDay)} through ${esc(report.toDay)} (inclusive), ${esc(report.timeZone)}</p><p>${esc(report.dateBasis)}. Generated ${esc(report.generatedAt)}. ${report.rows.length} records.</p><p class="hint">Use your browser’s Print command to print or save as PDF. Contains confidential care information; keep in approved agency storage.</p><p>Authoritative records; no draft notes. This report is not a new signature or an approval.</p>${
		report.goalSummary
			? '<h2>Goal progress summary</h2>' +
				report.goalSummary
					.map(
						(r, i) =>
							`<article><h3>Goal ${i + 1}</h3><dl>${Object.keys(r)
								.map((k) => `<dt>${esc(k.replace(/([A-Z])/g, ' $1'))}</dt><dd>${esc(r[k])}</dd>`)
								.join('')}</dl></article>`
					)
					.join('') +
				'<h2>Source trial history</h2>'
			: ''
	}${report.rows.map((r, i) => `<article><h2>Record ${i + 1}</h2><dl>${columns.map((k) => `<dt>${esc(k.replace(/([A-Z])/g, ' $1'))}</dt><dd>${esc(r[k])}</dd>`).join('')}</dl></article>`).join('')}${report.rows.length ? '' : '<p>No records in this period.</p>'}</body></html>`;
}
