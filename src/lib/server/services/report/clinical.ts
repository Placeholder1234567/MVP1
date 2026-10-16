import { z } from 'zod';
import { addDays } from '../../../domain/time';
import {
	CLINICAL_TYPES,
	clinicalCsv,
	clinicalHtml,
	clinicalPeriod,
	type ClinicalReport
} from '../../../domain/clinical-export';
import { asService, type RequestInfo, type Tx } from '../../db';
import { ServiceError } from '../../errors';
import type { CurrentUser } from '../auth/index.ts';
import { clinicalScope, clinicalRows, clinicalNoteHistory } from './clinical.queries';
import { recordExport } from './report.queries';

export const ClinicalExport = z.object({
	type: z.enum(CLINICAL_TYPES),
	homeId: z.uuid(),
	clientId: z.uuid().optional(),
	fromDay: z.iso.date(),
	toDay: z.iso.date(),
	format: z.enum(['csv', 'json', 'html']),
	approvedOnly: z.boolean().default(false)
});
const REQUIRED_FEATURE = {
	notes: 'charting',
	mar: 'mar',
	health: 'health',
	incidents: 'incidents',
	attendance: 'charting'
} as const;
const DATE_BASIS = {
	notes:
		'Shift start calendar day in agency time zone; overnight notes remain on the shift start day',
	mar: 'Recorded dose calendar day in agency time zone; includes amendments and conflicting records',
	health:
		'Recorded timestamp from agency start midnight through exclusive midnight after the end date',
	incidents:
		'Occurrence timestamp from agency start midnight through exclusive midnight after the end date; undated incidents excluded',
	attendance: 'Service calendar day in agency time zone'
};
export async function exportClinical(
	tx: Tx,
	user: CurrentUser,
	input: z.input<typeof ClinicalExport>,
	request: RequestInfo
) {
	const p = ClinicalExport.parse(input);
	if (
		user.role === 'caregiver' ||
		!user.features.includes('reports') ||
		!user.features.includes(REQUIRED_FEATURE[p.type])
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
	const rows = await clinicalRows(tx, user.agencyId, {
		...p,
		toDayExclusive: addDays(p.toDay, 1),
		...period
	});
	if (rows.length > 1000)
		throw new ServiceError(
			'VALIDATION_FAILED',
			'Report exceeds 1,000 records. Choose a shorter period or one person.'
		);
	if (p.type === 'notes' && rows.length) {
		const events = await clinicalNoteHistory(
			tx,
			user.agencyId,
			rows.map((r) => String(r.id))
		);
		if (events.length > 5000)
			throw new ServiceError(
				'VALIDATION_FAILED',
				'Report has too many signature events. Choose a shorter period.'
			);
		for (const row of rows)
			row.signatureEvents = events
				.filter((e) => e.noteId === row.id)
				.map(({ action, byName, occurredAt }) => ({ action, byName, occurredAt }));
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
		rows
	};
	const json = JSON.stringify(report, null, 2);
	if (Buffer.byteLength(json, 'utf8') > 8 * 1024 * 1024)
		throw new ServiceError(
			'VALIDATION_FAILED',
			'Report is too large. Choose a shorter period or one person.'
		);
	const content =
		p.format === 'json' ? json : p.format === 'csv' ? clinicalCsv(report) : clinicalHtml(report);
	if (Buffer.byteLength(content, 'utf8') > 8 * 1024 * 1024)
		throw new ServiceError(
			'VALIDATION_FAILED',
			'Report is too large. Choose a shorter period or one person.'
		);
	await asService(tx, (t) =>
		recordExport(t, user.agencyId, user.profileId, p.format, rows.length, request, p.type)
	);
	return {
		content,
		filename: `guad-care-report.${p.format}`,
		contentType:
			p.format === 'csv'
				? 'text/csv;charset=utf-8'
				: p.format === 'html'
					? 'text/html;charset=utf-8'
					: 'application/json;charset=utf-8',
		rows: rows.length
	};
}
