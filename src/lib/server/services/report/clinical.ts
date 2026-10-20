import { z } from 'zod';
import { addDays } from '../../../domain/time';
import {
	CLINICAL_TYPES,
	clinicalCsv,
	clinicalHtml,
	clinicalPeriod,
	type ClinicalReport
} from '../../../domain/clinical-export';
import { clinicalPdfReport } from '../../../domain/report-pdf';
import { asService, type RequestInfo, type Tx } from '../../db';
import { ServiceError } from '../../errors';
import { PdfUnsupportedText, renderPdf } from '../../pdf';
import type { CurrentUser } from '../auth/index.ts';
import { clinicalScope, clinicalRows, clinicalNoteHistory } from './clinical.queries';
import { recordExport } from './report.queries';
import { goalProgress } from '../../../domain/goal-progress';

export const ClinicalExport = z.object({
	type: z.enum(CLINICAL_TYPES),
	homeId: z.uuid(),
	clientId: z.uuid().optional(),
	fromDay: z.iso.date(),
	toDay: z.iso.date(),
	format: z.enum(['csv', 'json', 'html', 'pdf']),
	approvedOnly: z.boolean().default(false)
});
const REQUIRED_FEATURE = {
	notes: 'charting',
	mar: 'mar',
	health: 'health',
	incidents: 'incidents',
	attendance: 'charting',
	goals: 'goals'
} as const;
const DATE_BASIS = {
	notes:
		'Shift start calendar day in agency time zone; overnight notes remain on the shift start day',
	mar: 'Recorded dose calendar day in agency time zone; includes amendments and conflicting records',
	health:
		'Recorded timestamp from agency start midnight through exclusive midnight after the end date',
	incidents:
		'Occurrence timestamp from agency start midnight through exclusive midnight after the end date; undated incidents excluded',
	attendance: 'Service calendar day in agency time zone',
	goals:
		'Signed note shift start calendar day in agency time zone; definitions are current, not historical snapshots; refusal and unknown trial codes remain in the recorded-trial denominator'
};
const CONTENT_TYPES = {
	csv: 'text/csv;charset=utf-8',
	json: 'application/json;charset=utf-8',
	html: 'text/html;charset=utf-8',
	pdf: 'application/pdf'
} as const;
/** Validates the live role, features, period and RLS-scoped home/person without exporting. */
export async function clinicalAccess(
	tx: Tx,
	user: CurrentUser,
	input: z.input<typeof ClinicalExport>
) {
	const p = ClinicalExport.parse(input);
	if (
		user.role === 'caregiver' ||
		!user.features.includes('reports') ||
		!user.features.includes(REQUIRED_FEATURE[p.type]) ||
		(p.type === 'goals' && !user.features.includes('charting'))
	)
		throw new ServiceError(
			'FORBIDDEN',
			'This report is not available for your role or agency plan'
		);
	let period: { from: Date; to: Date };
	try {
		period = clinicalPeriod(p.fromDay, p.toDay, user.timeZone);
	} catch {
		throw new ServiceError(
			'VALIDATION_FAILED',
			'Choose one to 93 valid calendar days in the agency time zone'
		);
	}
	if (!(await clinicalScope(tx, user.agencyId, p.homeId, p.clientId)))
		throw new ServiceError('NOT_FOUND', 'Report scope is unavailable');
	return { p, period };
}

export async function exportClinical(
	tx: Tx,
	user: CurrentUser,
	input: z.input<typeof ClinicalExport>,
	request: RequestInfo,
	options: { background?: boolean; onClients?: (ids: string[]) => void } = {}
) {
	const { p, period } = await clinicalAccess(tx, user, input);
	const rowLimit = options.background ? (p.format === 'pdf' ? 2000 : 10000) : 1000;
	const historyLimit = options.background ? 50000 : 5000;
	const rows = await clinicalRows(tx, user.agencyId, {
		...p,
		toDayExclusive: addDays(p.toDay, 1),
		...period,
		rowLimit
	});
	if (rows.length > rowLimit)
		throw new ServiceError(
			'VALIDATION_FAILED',
			`Report exceeds ${rowLimit.toLocaleString('en-US')} records. Choose a shorter period or one person.`
		);
	options.onClients?.([...new Set(rows.map((r) => String(r.clientId)))]);
	if ((p.type === 'notes' || p.type === 'goals') && rows.length) {
		const events = await clinicalNoteHistory(
			tx,
			user.agencyId,
			[...new Set(rows.map((r) => String(p.type === 'goals' ? r.noteId : r.id)))],
			historyLimit
		);
		if (events.length > historyLimit)
			throw new ServiceError(
				'VALIDATION_FAILED',
				'Report has too many signature events. Choose a shorter period.'
			);
		const byNote = new Map<string, Array<Omit<(typeof events)[number], 'noteId'>>>();
		for (const { noteId, ...event } of events) {
			const group = byNote.get(noteId) ?? [];
			group.push(event);
			byNote.set(noteId, group);
		}
		for (const row of rows)
			row.signatureEvents = byNote.get(String(p.type === 'goals' ? row.noteId : row.id)) ?? [];
	}
	const report: ClinicalReport = {
		version: 1,
		type: p.type,
		fromDay: p.fromDay,
		toDay: p.toDay,
		timeZone: user.timeZone,
		fromUtc: period.from.toISOString(),
		toUtcExclusive: period.to.toISOString(),
		generatedAt: new Date().toISOString(),
		dateBasis: DATE_BASIS[p.type],
		rows,
		...(p.type === 'goals' ? { goalSummary: goalProgress(rows) } : {})
	};
	const json = JSON.stringify(report, null, 2);
	if (Buffer.byteLength(json, 'utf8') > 8 * 1024 * 1024)
		throw new ServiceError(
			'VALIDATION_FAILED',
			'Report is too large. Choose a shorter period or one person.'
		);
	let content: string;
	let bytes: number;
	if (p.format === 'pdf') {
		let pdf: Buffer;
		try {
			pdf = await renderPdf(clinicalPdfReport(report));
		} catch (e) {
			if (e instanceof PdfUnsupportedText)
				throw new ServiceError(
					'VALIDATION_FAILED',
					'This report has characters the PDF can’t show. Download CSV or print-ready HTML instead.'
				);
			throw e;
		}
		// tRPC carries JSON, so the PDF travels as base64.
		content = pdf.toString('base64');
		bytes = pdf.length;
	} else {
		content =
			p.format === 'json' ? json : p.format === 'csv' ? clinicalCsv(report) : clinicalHtml(report);
		bytes = Buffer.byteLength(content, 'utf8');
	}
	if (bytes > 8 * 1024 * 1024)
		throw new ServiceError(
			'VALIDATION_FAILED',
			'Report is too large. Choose a shorter period or one person.'
		);
	await asService(tx, (t) =>
		recordExport(t, user.agencyId, user.profileId, p.format, rows.length, request, p.type, {
			homeId: p.homeId,
			clientId: p.clientId ?? null,
			fromDay: p.fromDay,
			toDay: p.toDay,
			approvedOnly: p.approvedOnly,
			clientIds: [...new Set(rows.map((r) => String(r.clientId)))]
		})
	);
	return {
		content,
		filename: `guad-care-report.${p.format}`,
		contentType: CONTENT_TYPES[p.format],
		encoding: p.format === 'pdf' ? ('base64' as const) : ('utf8' as const),
		rows: rows.length
	};
}
