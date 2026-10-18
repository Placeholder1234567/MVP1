// API reports (openapi.yaml /reports/{type}): POST queues a report-generate
// task and answers 202 with a report_id; the task writes a CSV to private
// storage (src/lib/server/storage.ts) and marks it ready for 24 hours; GET
// polls the status and /download returns the file. An hourly cleanup removes
// expired files. PDF output is not built yet.
import { z } from 'zod';
import {
	addDays,
	ApiInputError,
	dateRange,
	localInstant,
	REPORT_RETENTION_HOURS,
	type ReportType
} from '../../../domain/index.ts';
import { withService } from '../../db';
import { enqueue } from '../../jobs/queue.ts';
import { fileStorage } from '../../storage.ts';
import { exportCsv } from './export';
import type { ApiCaller } from './keys';
import {
	expiredJobs,
	insertJob,
	jobById,
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
}

export async function requestReport(caller: ApiCaller, type: ReportType, body: unknown) {
	const b = ReportBody.parse(body);
	if (b.format === 'pdf')
		throw new ApiInputError("PDF reports aren't available yet. Use format csv.");
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
		insertJob(tx, { agency_id: caller.agencyId, type, format: 'csv', params, status: 'queued' })
	);
	await enqueue('report-generate', { id: job.id }, { taskName: `report-${job.id}` });
	return { report_id: job.id, status: 'queued' as const, estimated_seconds: 10 };
}

/** report-generate: builds the CSV and stores it for 24 hours. */
export async function generateReport(input: { id: string }): Promise<{ status: string }> {
	const job = await withService((tx) => jobById(tx, null, input.id));
	if (!job || job.status !== 'queued') return { status: job?.status ?? 'gone' };
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
		if (rows.length > REPORT_ROW_LIMIT) {
			await withService((tx) =>
				setJob(tx, job.id, {
					status: 'failed',
					error: 'Report exceeds 50,000 records. Choose a shorter period or one home.'
				})
			);
			return { status: 'failed' };
		}
		const columns = REPORT_COLUMNS[job.type];
		const data = rows.map((r) =>
			Object.fromEntries(
				columns.map((c) => [c, r[c] instanceof Date ? (r[c] as Date).toISOString() : r[c]])
			)
		);
		const path = `reports/${job.agency_id}/${job.id}.csv`;
		await fileStorage().put(path, Buffer.from(exportCsv(columns, data), 'utf8'), 'text/csv');
		const now = new Date();
		await withService((tx) =>
			setJob(tx, job.id, {
				status: 'ready',
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
	if (!job || job.type !== type) return null;
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
	| { kind: 'file'; body: string; filename: string; rows: number };

export async function downloadReport(
	caller: ApiCaller,
	type: ReportType,
	id: string
): Promise<DownloadResult> {
	const job = await withService((tx) => jobById(tx, caller.agencyId, id));
	if (!job || job.type !== type) return { kind: 'missing' };
	if (
		job.status !== 'ready' ||
		!job.storage_path ||
		!job.expires_at ||
		job.expires_at <= new Date()
	)
		return { kind: 'not-ready' };
	const file = await fileStorage().get(job.storage_path);
	if (!file) return { kind: 'not-ready' };
	const body = file.toString('utf8');
	return {
		kind: 'file',
		body,
		filename: `report-${type}-${job.ready_at!.toISOString().slice(0, 10)}.csv`,
		rows: Math.max(0, body.split('\r\n').length - 1)
	};
}

/** report-cleanup (hourly): deletes expired report files. */
export async function cleanupReports(now = new Date()): Promise<{ removed: number }> {
	const jobs = await withService((tx) => expiredJobs(tx, now));
	for (const j of jobs) {
		if (j.path) await fileStorage().remove(j.path);
		await withService((tx) => setJob(tx, j.id, { storage_path: null }));
	}
	return { removed: jobs.length };
}
