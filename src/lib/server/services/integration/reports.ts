// API reports (openapi.yaml /reports/{type}): POST queues a report-generate
// task and answers 202 with a report_id; the task writes a CSV or PDF to
// private storage (src/lib/server/storage.ts) and marks it ready for 24 hours;
// GET polls the status and /download returns the file. An hourly cleanup
// removes expired files.
import { z } from 'zod';
import {
	addDays,
	ApiInputError,
	dateRange,
	localInstant,
	REPORT_RETENTION_HOURS,
	type ReportType
} from '../../../domain/index.ts';
import { tablePdfReport } from '../../../domain/report-pdf';
import { withService } from '../../db';
import { enqueue } from '../../jobs/queue.ts';
import { PdfUnsupportedText, renderPdf } from '../../pdf.ts';
import { fileStorage } from '../../storage.ts';
import { exportCsv } from './export';
import { generateCareReport } from '../report/index.ts';
import type { ApiCaller } from './keys';
import {
	expiredJobs,
	clearExpiredPath,
	insertJob,
	jobById,
	PDF_ROW_LIMIT,
	REPORT_COLUMNS,
	REPORT_ROW_LIMIT,
	reportRows,
	setJob
} from './reports.queries';

const ReportBody = z.object({
	from: z.string(),
	to: z.string(),
	home_id: z.uuid().optional(),
	client_id: z.uuid().optional(),
	format: z.enum(['csv', 'pdf']).default('csv')
});

interface ReportParams {
	from: string;
	to: string;
	home_id: string | null;
	client_id: string | null;
	time_zone: string;
	api_key_id: string;
	/** Set when the file is ready; the download audit records it. */
	rows?: number;
}

const FILE = {
	csv: { ext: 'csv', contentType: 'text/csv; charset=utf-8' },
	pdf: { ext: 'pdf', contentType: 'application/pdf' }
} as const;
const fileFormat = (format: string) => (format === 'pdf' ? FILE.pdf : FILE.csv);

export async function requestReport(caller: ApiCaller, type: ReportType, body: unknown) {
	const b = ReportBody.parse(body);
	const { from, to } = dateRange(b.from, b.to, true);
	if (b.client_id && (type === 'timesheets' || type === 'audit'))
		throw new ApiInputError("'client_id' applies to incidents, notes, mar, goals and attendance");
	const params: ReportParams = {
		from: from!,
		to: to!,
		home_id: b.home_id ?? null,
		client_id: b.client_id ?? null,
		time_zone: caller.timeZone,
		api_key_id: caller.keyId
	};
	const job = await withService((tx) =>
		insertJob(tx, { agency_id: caller.agencyId, type, format: b.format, params, status: 'queued' })
	);
	await enqueue('report-generate', { id: job.id }, { taskName: `report-${job.id}` });
	return { report_id: job.id, status: 'queued' as const, estimated_seconds: 10 };
}

/** report-generate: builds the CSV or PDF and stores it for 24 hours. */
export async function generateReport(input: { id: string }): Promise<{ status: string }> {
	const job = await withService((tx) => jobById(tx, null, input.id));
	if (!job || job.status !== 'queued') return { status: job?.status ?? 'gone' };
	if (job.requested_by) return generateCareReport(input);
	await withService((tx) => setJob(tx, job.id, { status: 'processing' }));
	try {
		const p = job.params as ReportParams;
		const rows = await withService((tx) =>
			reportRows(tx, job.type, {
				agencyId: job.agency_id,
				fromDay: p.from,
				toDay: p.to,
				start: localInstant(p.from, '00:00', p.time_zone),
				end: localInstant(addDays(p.to, 1), '00:00', p.time_zone),
				homeId: p.home_id,
				clientId: p.client_id
			})
		);
		const fail = async (error: string) => {
			await withService((tx) => setJob(tx, job.id, { status: 'failed', error }));
			return { status: 'failed' };
		};
		if (rows.length > REPORT_ROW_LIMIT)
			return fail('Report exceeds 50,000 records. Choose a shorter period or one home.');
		if (job.format === 'pdf' && rows.length > PDF_ROW_LIMIT)
			return fail(
				'PDF reports hold up to 2,000 records. Choose a shorter period or one home, or use format csv.'
			);
		const columns = REPORT_COLUMNS[job.type];
		const data = rows.map((r) =>
			Object.fromEntries(
				columns.map((c) => [c, r[c] instanceof Date ? (r[c] as Date).toISOString() : r[c]])
			)
		);
		const file = fileFormat(job.format);
		let body: Buffer;
		if (job.format === 'pdf') {
			try {
				body = await renderPdf(
					tablePdfReport({
						type: job.type,
						from: p.from,
						to: p.to,
						timeZone: p.time_zone,
						generatedAt: new Date().toISOString(),
						columns,
						rows: data
					})
				);
			} catch (e) {
				if (!(e instanceof PdfUnsupportedText)) throw e;
				return fail("This report has characters the PDF can't show. Use format csv.");
			}
		} else body = Buffer.from(exportCsv(columns, data), 'utf8');
		const path = `reports/${job.agency_id}/${job.id}.${file.ext}`;
		await fileStorage().put(path, body, file.contentType);
		const now = new Date();
		await withService((tx) =>
			setJob(tx, job.id, {
				status: 'ready',
				params: { ...p, rows: rows.length },
				storage_path: path,
				ready_at: now,
				expires_at: new Date(now.getTime() + REPORT_RETENTION_HOURS * 3600_000)
			})
		);
		return { status: 'ready' };
	} catch (e) {
		// The message can carry query detail; keep the stored error generic.
		console.error(`report ${job.id} failed: ${(e as Error)?.name ?? 'Error'}`);
		await withService((tx) =>
			setJob(tx, job.id, { status: 'failed', error: 'Report generation failed. Try again.' })
		);
		return { status: 'failed' };
	}
}

export async function reportStatus(caller: ApiCaller, type: ReportType, id: string) {
	const job = await withService((tx) => jobById(tx, caller.agencyId, id));
	if (!job || job.requested_by || job.type !== type) return null;
	const expired = job.expires_at !== null && job.expires_at <= new Date();
	return {
		report_id: job.id,
		type: job.type,
		status: job.status,
		format: job.format,
		created_at: job.created_at.toISOString(),
		...(job.ready_at ? { ready_at: job.ready_at.toISOString() } : {}),
		...(job.expires_at ? { expires_at: job.expires_at.toISOString() } : {}),
		...(job.error ? { error: job.error } : expired ? { error: 'Report has expired' } : {})
	};
}

export type DownloadResult =
	| { kind: 'missing' }
	| { kind: 'not-ready' }
	| { kind: 'file'; body: Buffer; contentType: string; filename: string; rows: number };

export async function downloadReport(
	caller: ApiCaller,
	type: ReportType,
	id: string
): Promise<DownloadResult> {
	const job = await withService((tx) => jobById(tx, caller.agencyId, id));
	if (!job || job.requested_by || job.type !== type) return { kind: 'missing' };
	if (
		job.status !== 'ready' ||
		!job.storage_path ||
		!job.expires_at ||
		job.expires_at <= new Date()
	)
		return { kind: 'not-ready' };
	const body = await fileStorage().get(job.storage_path);
	if (!body) return { kind: 'not-ready' };
	const file = fileFormat(job.format);
	const rows = (job.params as ReportParams).rows;
	return {
		kind: 'file',
		body,
		contentType: file.contentType,
		filename: `report-${type}-${job.ready_at!.toISOString().slice(0, 10)}.${file.ext}`,
		// Files from before the count was stored: count CSV lines.
		rows: rows ?? Math.max(0, body.toString('utf8').split('\r\n').length - 1)
	};
}

/** report-cleanup (hourly): deletes expired report files. */
export async function cleanupReports(now = new Date()): Promise<{ removed: number }> {
	const jobs = await withService((tx) => expiredJobs(tx, now));
	for (const j of jobs) {
		if (j.path) await fileStorage().remove(j.path);
		await withService((tx) => clearExpiredPath(tx, j));
	}
	return { removed: jobs.length };
}
