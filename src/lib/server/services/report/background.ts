import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { afterCommit, asService, withService, withUser, type RequestInfo, type Tx } from '../../db';
import { SCHEDULED_REPORT_DAYS } from '../../../domain/index.ts';
import { ServiceError } from '../../errors';
import { enqueue } from '../../jobs/queue';
import { fileStorage } from '../../storage';
import { getCurrentUser, type CurrentUser } from '../auth';
import { ClinicalExport, clinicalAccess, exportClinical } from './clinical';
import { recordExport } from './report.queries';
import {
	claimCareReport,
	insertCareReport,
	ownReport,
	queuedCareReport,
	requesterUid,
	updateCareReport,
	visibleReportClients,
	publishCareReport,
	recentCareReports
} from './background.queries';
import { clinicalScope } from './clinical.queries';
import { scheduledReportReady } from './schedule-notify';

export const BackgroundRequest = ClinicalExport.extend({ expectedProfileId: z.uuid() });
export const BackgroundId = z.object({ id: z.uuid(), expectedProfileId: z.uuid() });
export const BackgroundRecent = z.object({ homeId: z.uuid(), expectedProfileId: z.uuid() });
const Params = z.object({
	kind: z.literal('care-v1'),
	input: ClinicalExport,
	clientIds: z.array(z.uuid()).max(10000).default([]),
	rows: z.number().int().min(0).max(10000).optional(),
	revision: z.uuid().optional(),
	/** Set when a report schedule queued it (schedule.ts) */
	scheduleId: z.uuid().optional()
});
const FORMAT = {
	csv: { contentType: 'text/csv;charset=utf-8', encoding: 'utf8' },
	json: { contentType: 'application/json;charset=utf-8', encoding: 'utf8' },
	html: { contentType: 'text/html;charset=utf-8', encoding: 'utf8' },
	pdf: { contentType: 'application/pdf', encoding: 'base64' }
} as const;
const unavailable = () =>
	new ServiceError('NOT_FOUND', 'Report is unavailable for this account or its current access.');
function bindProfile(user: CurrentUser, expected: string) {
	if (user.profileId !== expected) throw unavailable();
}
/** Queued app reports are narrower than the agency-wide external API. */
function assignedHome(user: CurrentUser, homeId: string) {
	if (user.role !== 'admin' && !user.homeIds.includes(homeId)) throw unavailable();
}

export async function requestBackground(
	tx: Tx,
	user: CurrentUser,
	input: z.input<typeof BackgroundRequest>
) {
	const { expectedProfileId, ...raw } = BackgroundRequest.parse(input);
	bindProfile(user, expectedProfileId);
	return queueCareReport(tx, user, raw, { minutes: 15 });
}

/** Whether `user` may have this care report built for them (their homes, plan and role). */
export async function careReportAccess(
	tx: Tx,
	user: CurrentUser,
	raw: z.input<typeof ClinicalExport>
) {
	assignedHome(user, ClinicalExport.parse(raw).homeId);
	return clinicalAccess(tx, user, raw);
}

/**
 * Queues a care report for `user` (their access is checked now and again
 * when it is built). It must be built within `minutes`; a scheduled run
 * passes its schedule, so the file is kept 7 days instead of 24 hours and
 * the owner hears when it is ready.
 */
export async function queueCareReport(
	tx: Tx,
	user: CurrentUser,
	raw: z.input<typeof ClinicalExport>,
	options: { minutes: number; scheduleId?: string }
) {
	const { p } = await careReportAccess(tx, user, raw);
	const id = randomUUID();
	const path = `care-reports/${user.agencyId}/${id}.${p.format}`;
	const job = await asService(tx, (t) =>
		insertCareReport(t, {
			id,
			agency_id: user.agencyId,
			requested_by: user.profileId,
			type: p.type,
			format: p.format,
			params: {
				kind: 'care-v1',
				input: p,
				clientIds: [],
				revision: randomUUID(),
				...(options.scheduleId ? { scheduleId: options.scheduleId } : {})
			},
			status: 'queued',
			storage_path: path,
			expires_at: new Date(Date.now() + options.minutes * 60000)
		})
	);
	// The row must be committed before a local worker can see it.
	afterCommit(async () => {
		try {
			await enqueue('report-generate', { id }, { taskName: `care-report-${id}` });
		} catch {
			await withService((t) =>
				updateCareReport(t, user, id, {
					status: 'failed',
					error: 'Could not queue this report. Request a new report when connected.'
				})
			);
		}
	});
	return {
		id,
		type: p.type,
		format: p.format,
		status: 'queued' as const,
		homeId: p.homeId,
		clientId: p.clientId,
		fromDay: p.fromDay,
		toDay: p.toDay,
		approvedOnly: p.approvedOnly,
		createdAt: job.created_at.toISOString(),
		expiresAt: job.expires_at!.toISOString()
	};
}

type CareJob = NonNullable<Awaited<ReturnType<typeof ownReport>>>;
async function authorisedParams(tx: Tx, user: CurrentUser, job: CareJob | null) {
	const parsed = Params.safeParse(job?.params);
	if (
		!job ||
		!parsed.success ||
		job.type !== parsed.data.input.type ||
		job.format !== parsed.data.input.format
	)
		throw unavailable();
	assignedHome(user, parsed.data.input.homeId);
	await clinicalAccess(tx, user, parsed.data.input);
	if (!(await visibleReportClients(tx, user, parsed.data.input.homeId, parsed.data.clientIds)))
		throw unavailable();
	return parsed.data;
}
async function authorisedJob(tx: Tx, user: CurrentUser, raw: z.input<typeof BackgroundId>) {
	const input = BackgroundId.parse(raw);
	bindProfile(user, input.expectedProfileId);
	const job = await ownReport(tx, user, input.id);
	const params = await authorisedParams(tx, user, job);
	return { job: job!, params };
}
function describeStatus(job: CareJob, params: z.infer<typeof Params>) {
	const expired = !job.expires_at || job.expires_at <= new Date();
	const status: 'queued' | 'processing' | 'ready' | 'failed' | 'expired' = expired
		? 'expired'
		: job.status === 'ready'
			? 'ready'
			: job.status === 'processing'
				? 'processing'
				: job.status === 'queued'
					? 'queued'
					: 'failed';
	return {
		id: job.id,
		type: params.input.type,
		format: params.input.format,
		status,
		homeId: params.input.homeId,
		clientId: params.input.clientId,
		fromDay: params.input.fromDay,
		toDay: params.input.toDay,
		approvedOnly: params.input.approvedOnly,
		createdAt: job.created_at.toISOString(),
		expiresAt: job.expires_at?.toISOString(),
		...(status === 'ready' ? { rows: params.rows } : {}),
		...(status === 'failed'
			? { error: 'Could not generate this report. Try a smaller period or a different format.' }
			: {})
	};
}

export async function backgroundStatus(
	tx: Tx,
	user: CurrentUser,
	input: z.input<typeof BackgroundId>
) {
	const { job, params } = await authorisedJob(tx, user, input);
	return describeStatus(job, params);
}

/** Bounded account history lets users recover references after a reload or privacy lock. */
export async function recentBackground(
	tx: Tx,
	user: CurrentUser,
	raw: z.input<typeof BackgroundRecent>
) {
	const input = BackgroundRecent.parse(raw);
	bindProfile(user, input.expectedProfileId);
	assignedHome(user, input.homeId);
	if (
		user.role === 'caregiver' ||
		!user.features.includes('reports') ||
		!(await clinicalScope(tx, user.agencyId, input.homeId))
	)
		throw unavailable();
	const results: ReturnType<typeof describeStatus>[] = [];
	for (const job of await recentCareReports(tx, user)) {
		const parsed = Params.safeParse(job.params);
		if (!parsed.success || parsed.data.input.homeId !== input.homeId) continue;
		try {
			const params = await authorisedParams(tx, user, job);
			results.push(describeStatus(job, params));
			if (results.length === 20) break;
		} catch (error) {
			if (!(error instanceof ServiceError)) throw error;
		}
	}
	return results;
}

export async function downloadBackground(
	tx: Tx,
	user: CurrentUser,
	input: z.input<typeof BackgroundId>,
	request: RequestInfo
) {
	const { job, params } = await authorisedJob(tx, user, input);
	if (
		job.status !== 'ready' ||
		!job.expires_at ||
		job.expires_at <= new Date() ||
		!job.storage_path ||
		params.rows === undefined
	)
		throw unavailable();
	const body = await fileStorage().get(job.storage_path);
	if (!body || body.length > 8 * 1024 * 1024 || job.expires_at <= new Date()) throw unavailable();
	await asService(tx, (t) =>
		recordExport(
			t,
			user.agencyId,
			user.profileId,
			job.format,
			params.rows!,
			request,
			`background-download:${job.type}`
		)
	);
	const file = FORMAT[params.input.format];
	return {
		content: body.toString(file.encoding),
		filename: `guad-care-report.${params.input.format}`,
		contentType: file.contentType,
		encoding: file.encoding,
		rows: params.rows
	};
}

/** Runs through the existing report queue. Data reads always use fresh owner claims and RLS. */
export async function generateCareReport(input: { id: string }): Promise<{ status: string }> {
	const job = await withService((tx) => queuedCareReport(tx, input.id));
	if (!job?.requested_by) return { status: 'gone' };
	const parsed = Params.safeParse(job.params);
	if (
		!parsed.success ||
		job.type !== parsed.data.input.type ||
		job.format !== parsed.data.input.format
	)
		return { status: 'gone' };
	if (job.status !== 'queued') return { status: job.status };
	const uid = await withService((tx) => requesterUid(tx, job.agency_id, job.requested_by!));
	const user = uid ? await getCurrentUser(uid) : null;
	// Use the recorded owner only for this restricted status write, never as read claims.
	const owner = { agencyId: job.agency_id, profileId: job.requested_by };
	const fail = async () => {
		await withService((tx) =>
			updateCareReport(tx, owner, job.id, {
				status: 'failed',
				storage_path: job.storage_path,
				params: { ...parsed.data, revision: randomUUID() },
				error: 'Could not generate this report. Try a smaller period or a different format.'
			})
		);
		return { status: 'failed' };
	};
	if (
		!user ||
		user.agencyId !== job.agency_id ||
		user.profileId !== job.requested_by ||
		!job.expires_at ||
		job.expires_at <= new Date()
	)
		return fail();
	const claimed = await withService((tx) => claimCareReport(tx, user, job.id, new Date()));
	if (!claimed) return { status: 'unclaimed' };
	let writeStarted = false;
	const removeLateFile = async () => {
		if (writeStarted && claimed.storage_path) {
			try {
				await fileStorage().remove(claimed.storage_path);
			} catch {
				/* fail() restores the durable pointer for the next expiry sweep. */
			}
		}
	};
	try {
		assignedHome(user, parsed.data.input.homeId);
		let clientIds: string[] = [];
		const file = await withUser(user.claims, {}, (tx) =>
			exportClinical(
				tx,
				user,
				parsed.data.input,
				{},
				{
					background: true,
					onClients: (ids) => {
						clientIds = ids;
					}
				}
			)
		);
		const params = Params.parse({
			...parsed.data,
			rows: file.rows,
			clientIds,
			revision: randomUUID()
		});
		if (!job.expires_at || job.expires_at <= new Date() || !claimed.storage_path) return fail();
		const body = Buffer.from(file.content, file.encoding);
		writeStarted = true;
		await fileStorage().put(claimed.storage_path, body, file.contentType);
		if (job.expires_at <= new Date()) {
			await removeLateFile();
			return fail();
		}
		// Ready files remain private and are never handed out by storage URLs.
		const published = await withService((tx) =>
			publishCareReport(
				tx,
				user,
				job.id,
				claimed.storage_path!,
				params,
				// Scheduled reports wait for their owner longer (report-schedule.ts).
				params.scheduleId ? SCHEDULED_REPORT_DAYS * 24 * 3600000 : undefined
			)
		);
		if (!published) {
			await removeLateFile();
			return fail();
		}
		if (params.scheduleId) await scheduledReportReady(user, job.id, params.input);
		return { status: 'ready' };
	} catch {
		await removeLateFile();
		// The deterministic storage path stays on the job for the existing expiry cleanup.
		return fail();
	}
}
