// Synthetic fixtures only. Queue delivery is manual; report files stay in memory.
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';

vi.mock('../../../src/lib/server/jobs/queue.ts', () => ({ enqueue: vi.fn(async () => undefined) }));
process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';

const { closeDb, withService } = await import('../../../src/lib/server/db');
const s = await import('../../../src/lib/server/db/schema');
const { getCurrentUser } = await import('../../../src/lib/server/services/auth');
const { appRouter } = await import('../../../src/lib/server/trpc/router');
const { createCallerFactory } = await import('../../../src/lib/server/trpc/middleware');
const { setStorageForTests } = await import('../../../src/lib/server/storage');
const { generateCareReport } = await import('../../../src/lib/server/services/report/index.ts');
const integration = await import('../../../src/lib/server/services/integration');
const { enqueue } = await import('../../../src/lib/server/jobs/queue');

const [agency, foreignAgency, home, nextHome, foreignHome, person, secondPerson] = Array.from(
	{ length: 7 },
	() => randomUUID()
);
const [owner, colleague, caregiver, foreignOwner] = Array.from({ length: 4 }, () => randomUUID());
const [signed, approved, draft, returned] = Array.from({ length: 4 }, () => randomUUID());
const uid = (id: string) => `background-report-${id}`;
const files = new Map<string, Buffer>();
let puts = 0;
let beforePut: ((path: string) => Promise<void>) | undefined;
let afterRemove: ((path: string) => Promise<void>) | undefined;
let failNextRemove = false;
const pendingReleases = new Set<() => void>();
afterEach(() => {
	beforePut = undefined;
	afterRemove = undefined;
	failNextRemove = false;
	vi.useRealTimers();
	for (const release of pendingReleases) release();
	pendingReleases.clear();
});
const caller = createCallerFactory(appRouter);
const as = async (id = owner) =>
	caller({
		user: await getCurrentUser(uid(id)),
		request: { ip: '127.0.0.1', user_agent: 'synthetic-background-report-test' }
	});
const input = {
	type: 'health' as 'health' | 'notes',
	homeId: home,
	clientId: person,
	fromDay: '2026-03-01',
	toDay: '2026-03-01',
	format: 'json' as const,
	expectedProfileId: owner
};
const jobInput = (id: string, expectedProfileId = owner) => ({ id, expectedProfileId });
const generate = async (id: string) => generateCareReport({ id });
async function queue(extra: Partial<typeof input> = {}) {
	return (await as()).report.requestBackground({ ...input, ...extra });
}
async function ready(extra: Partial<typeof input> = {}) {
	const job = await queue(extra);
	await generate(job.id);
	expect(await (await as()).report.backgroundStatus(jobInput(job.id))).toMatchObject({
		id: job.id,
		status: 'ready'
	});
	return job.id;
}

beforeAll(async () => {
	setStorageForTests({
		put: async (path, body) => {
			puts++;
			await beforePut?.(path);
			files.set(path, body);
		},
		get: async (path) => files.get(path) ?? null,
		remove: async (path) => {
			if (failNextRemove) {
				failNextRemove = false;
				throw new Error('Synthetic storage remove failure');
			}
			files.delete(path);
			await afterRemove?.(path);
		}
	});
	await withService(async (tx) => {
		await tx.insert(s.agencies).values(
			[agency, foreignAgency].map((id) => ({
				id,
				slug: `background-${id}`,
				name: 'Synthetic background report agency',
				subscription_tier: 'complete' as const,
				timezone: 'UTC'
			}))
		);
		await tx.insert(s.homes).values([
			{ id: home, agency_id: agency, name: 'Synthetic report home' },
			{ id: nextHome, agency_id: agency, name: 'Synthetic other home' },
			{ id: foreignHome, agency_id: foreignAgency, name: 'Synthetic foreign home' }
		]);
		await tx.insert(s.profiles).values(
			[owner, colleague, caregiver, foreignOwner].map((id) => ({
				id,
				agency_id: id === foreignOwner ? foreignAgency : agency,
				auth_uid: uid(id),
				email: `${id}@example.test`,
				name: 'Synthetic report staff',
				role: id === caregiver ? ('caregiver' as const) : ('supervisor' as const),
				home_ids: [id === foreignOwner ? foreignHome : home]
			}))
		);
		await tx.insert(s.clients).values(
			[person, secondPerson].map((id) => ({
				id,
				agency_id: agency,
				home_id: home,
				name: 'Synthetic report person'
			}))
		);
		await tx.insert(s.healthEntries).values(
			Array.from({ length: 1001 }, () => ({
				agency_id: agency,
				home_id: home,
				client_id: person,
				kind: 'vitals' as const,
				data: { pulse: 80 },
				recorded_at: new Date('2026-03-01T12:00:00Z'),
				recorded_by: caregiver
			}))
		);
		await tx.insert(s.notes).values(
			[
				{ id: signed, status: 'submitted' as const },
				{ id: approved, status: 'approved' as const },
				{ id: draft, status: 'draft' as const },
				{ id: returned, status: 'returned' as const }
			].map((row) => ({
				...row,
				agency_id: agency,
				home_id: home,
				client_id: person,
				author_id: caregiver,
				author_name: 'Synthetic author',
				day: '2026-03-01',
				shift: 'am' as const,
				type: 'shift' as const,
				content: { narrative: 'Synthetic report observation' }
			}))
		);
		await tx.insert(s.notes).values({
			agency_id: agency,
			home_id: home,
			client_id: secondPerson,
			author_id: caregiver,
			day: '2026-03-01',
			shift: 'am',
			type: 'shift',
			status: 'submitted',
			content: { narrative: 'Synthetic second person observation' }
		});
		await tx.insert(s.noteHistory).values({
			agency_id: agency,
			note_id: signed,
			action: 'signed',
			by_name: 'Synthetic author',
			occurred_at: new Date('2026-03-01T13:00:00Z')
		});
	});
});
afterAll(async () => {
	setStorageForTests(undefined);
	await closeDb();
});

it('keeps the synchronous cap while generating and downloading more than 1,000 queued records exactly once', async () => {
	const app = await as();
	await expect(app.report.exportClinical(input)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
	const queued = await queue();
	expect(queued).toMatchObject({ status: 'queued' });
	const queueLifetime =
		new Date(queued.expiresAt!).getTime() - new Date(queued.createdAt).getTime();
	expect(queueLifetime).toBeGreaterThan(14 * 60000);
	expect(queueLifetime).toBeLessThanOrEqual(15 * 60000 + 1000);
	expect(enqueue).toHaveBeenCalledWith('report-generate', { id: queued.id }, expect.any(Object));
	expect(await app.report.backgroundStatus(jobInput(queued.id))).toMatchObject({
		status: 'queued'
	});
	const before = puts;
	await Promise.all([generate(queued.id), generate(queued.id)]);
	expect(puts - before).toBe(1);
	const status = await app.report.backgroundStatus(jobInput(queued.id));
	expect(status).toMatchObject({ status: 'ready', rows: 1001 });
	expect(new Date(status.expiresAt!).getTime() - Date.now()).toBeGreaterThan(23 * 3600000);
	const download = await app.report.downloadBackground(jobInput(queued.id));
	expect(download).toMatchObject({ rows: 1001, encoding: 'utf8' });
	const report = JSON.parse(download.content);
	expect(report.rows).toHaveLength(1001);
	expect(report.rows.every((row: { clientId: string }) => row.clientId === person)).toBe(true);
	await generate(queued.id);
	expect(puts - before).toBe(1);
});

it('includes submitted and approved notes and signature events, excluding drafts and returned notes', async () => {
	const id = await ready({ type: 'notes' });
	const output = await (await as()).report.downloadBackground(jobInput(id));
	const rows = JSON.parse(output.content).rows;
	expect(rows.map((row: { id: string }) => row.id).sort()).toEqual([signed, approved].sort());
	expect(rows.find((row: { id: string }) => row.id === signed).signatureEvents).toEqual([
		expect.objectContaining({ action: 'signed', byName: 'Synthetic author' })
	]);
});

it('binds requests, status and downloads to the signed-in profile, owner, tenant, role and features', async () => {
	const id = await ready();
	for (const actor of [colleague, foreignOwner, caregiver]) {
		const app = await as(actor);
		for (const operation of [
			() => app.report.backgroundStatus(jobInput(id, actor)),
			() => app.report.downloadBackground(jobInput(id, actor))
		])
			await expect(operation()).rejects.toMatchObject({
				code: actor === caregiver ? 'FORBIDDEN' : 'NOT_FOUND'
			});
	}
	const app = await as();
	await expect(
		app.report.requestBackground({ ...input, expectedProfileId: colleague })
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
	await expect(app.report.backgroundStatus(jobInput(id, colleague))).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
	await expect(app.report.downloadBackground(jobInput(id, colleague))).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
	await expect(
		(await as(caregiver)).report.requestBackground({ ...input, expectedProfileId: caregiver })
	).rejects.toMatchObject({ code: 'FORBIDDEN' });
	const user = (await getCurrentUser(uid(owner)))!;
	for (const features of [
		user.features.filter((f) => f !== 'reports'),
		user.features.filter((f) => f !== 'health')
	]) {
		const restricted = caller({ user: { ...user, features }, request: {} });
		await expect(restricted.report.requestBackground(input)).rejects.toMatchObject({
			code: 'FORBIDDEN'
		});
		await expect(restricted.report.backgroundStatus(jobInput(id))).rejects.toMatchObject({
			code: 'FORBIDDEN'
		});
		await expect(restricted.report.downloadBackground(jobInput(id))).rejects.toMatchObject({
			code: 'FORBIDDEN'
		});
	}
});

it('reauthorizes home access after generation and refuses expired downloads', async () => {
	const id = await ready();
	await withService((tx) =>
		tx
			.update(s.profiles)
			.set({ home_ids: [nextHome] })
			.where(and(eq(s.profiles.agency_id, agency), eq(s.profiles.id, owner)))
	);
	try {
		const app = await as();
		await expect(app.report.backgroundStatus(jobInput(id))).rejects.toBeDefined();
		await expect(app.report.downloadBackground(jobInput(id))).rejects.toBeDefined();
	} finally {
		await withService((tx) =>
			tx
				.update(s.profiles)
				.set({ home_ids: [home] })
				.where(and(eq(s.profiles.agency_id, agency), eq(s.profiles.id, owner)))
		);
	}
	await withService((tx) =>
		tx
			.update(s.reportJobs)
			.set({ expires_at: new Date(Date.now() - 1000) })
			.where(and(eq(s.reportJobs.agency_id, agency), eq(s.reportJobs.id, id)))
	);
	expect(await (await as()).report.backgroundStatus(jobInput(id))).toMatchObject({
		status: 'expired'
	});
	await expect((await as()).report.downloadBackground(jobInput(id))).rejects.toBeDefined();
});

it('does not expose app-owned report jobs through same-agency external API report services', async () => {
	const id = await ready({ type: 'notes' });
	const api = {
		agencyId: agency,
		keyId: randomUUID(),
		scope: 'read' as const,
		timeZone: 'UTC',
		features: new Set(['reports', 'charting'])
	};
	expect(await integration.reportStatus(api, 'notes', id)).toBeNull();
	expect(await integration.downloadReport(api, 'notes', id)).toEqual({ kind: 'missing' });
});

it('checks every captured person in a home-wide ready report after a person moves', async () => {
	const id = await ready({ type: 'notes', clientId: undefined });
	await withService((tx) =>
		tx
			.update(s.clients)
			.set({ home_id: nextHome })
			.where(and(eq(s.clients.agency_id, agency), eq(s.clients.id, secondPerson)))
	);
	try {
		await expect((await as()).report.backgroundStatus(jobInput(id))).rejects.toBeDefined();
		await expect((await as()).report.downloadBackground(jobInput(id))).rejects.toBeDefined();
	} finally {
		await withService((tx) =>
			tx
				.update(s.clients)
				.set({ home_id: home })
				.where(and(eq(s.clients.agency_id, agency), eq(s.clients.id, secondPerson)))
		);
	}
});

it('uses fresh worker permissions rather than the claims present when the job was queued', async () => {
	const { id } = await queue();
	const before = puts;
	await withService((tx) =>
		tx
			.update(s.profiles)
			.set({ home_ids: [nextHome] })
			.where(and(eq(s.profiles.agency_id, agency), eq(s.profiles.id, owner)))
	);
	try {
		expect(await generate(id)).toMatchObject({ status: 'failed' });
		expect(puts).toBe(before);
	} finally {
		await withService((tx) =>
			tx
				.update(s.profiles)
				.set({ home_ids: [home] })
				.where(and(eq(s.profiles.agency_id, agency), eq(s.profiles.id, owner)))
		);
	}
	expect(await (await as()).report.backgroundStatus(jobInput(id))).toMatchObject({
		status: 'failed'
	});
});

it('refuses an expired queued job and cleans private paths for expired queued, processing and failed jobs', async () => {
	for (const status of ['queued', 'processing', 'failed']) {
		const { id } = await queue();
		const [job] = await withService((tx) =>
			tx
				.select()
				.from(s.reportJobs)
				.where(and(eq(s.reportJobs.agency_id, agency), eq(s.reportJobs.id, id)))
		);
		expect(job.storage_path).toBeTruthy();
		const path = job.storage_path!;
		files.set(path, Buffer.from('Synthetic incomplete file'));
		await withService((tx) =>
			tx
				.update(s.reportJobs)
				.set({ status, expires_at: new Date(Date.now() - 1000) })
				.where(and(eq(s.reportJobs.agency_id, agency), eq(s.reportJobs.id, id)))
		);
		if (status === 'queued') {
			const before = puts;
			expect(await generate(id)).toMatchObject({ status: 'failed' });
			expect(puts).toBe(before);
		}
		await integration.cleanupReports();
		expect(files.has(path)).toBe(false);
		const [cleaned] = await withService((tx) =>
			tx
				.select({ path: s.reportJobs.storage_path })
				.from(s.reportJobs)
				.where(and(eq(s.reportJobs.agency_id, agency), eq(s.reportJobs.id, id)))
		);
		expect(cleaned.path).toBeNull();
		await expect((await as()).report.downloadBackground(jobInput(id))).rejects.toBeDefined();
	}
});

it('removes a late storage write after expiry cleanup and retains its cleanup pointer if deletion fails', async () => {
	for (const failLateDelete of [false, true]) {
		const { id } = await queue();
		const [job] = await withService((tx) =>
			tx
				.select()
				.from(s.reportJobs)
				.where(and(eq(s.reportJobs.agency_id, agency), eq(s.reportJobs.id, id)))
		);
		const path = job.storage_path!;
		let release!: () => void;
		let started!: () => void;
		const putStarted = new Promise<void>((resolve) => {
			started = resolve;
		});
		const putReleased = new Promise<void>((resolve) => {
			release = resolve;
		});
		pendingReleases.add(release);
		beforePut = async (writePath) => {
			expect(writePath).toBe(path);
			started();
			await putReleased;
		};
		const generating = generate(id);
		try {
			await putStarted;
			// Advance Date alone: real database/network timers keep running. The
			// immutable original queue deadline expires while storage is blocked.
			vi.useFakeTimers({ toFake: ['Date'] });
			vi.setSystemTime(new Date(job.expires_at!.getTime() + 1000));
			await integration.cleanupReports();
			expect(files.has(path)).toBe(false);
			const [cleaned] = await withService((tx) =>
				tx
					.select({ path: s.reportJobs.storage_path })
					.from(s.reportJobs)
					.where(and(eq(s.reportJobs.agency_id, agency), eq(s.reportJobs.id, id)))
			);
			expect(cleaned.path).toBeNull();
			failNextRemove = failLateDelete;
			release();
			expect(await generating).toMatchObject({ status: 'failed' });
			if (failLateDelete) {
				expect(files.has(path)).toBe(true);
				const [failed] = await withService((tx) =>
					tx
						.select({ path: s.reportJobs.storage_path })
						.from(s.reportJobs)
						.where(and(eq(s.reportJobs.agency_id, agency), eq(s.reportJobs.id, id)))
				);
				expect(failed.path).toBe(path);
				await integration.cleanupReports();
			}
			expect(files.has(path)).toBe(false);
		} finally {
			vi.useRealTimers();
			beforePut = undefined;
			failNextRemove = false;
			release();
			await generating;
			pendingReleases.delete(release);
		}
	}
});

it('prevents an older cleanup from clearing a newer failure recovery pointer', async () => {
	const { id } = await queue();
	const [job] = await withService((tx) =>
		tx
			.select()
			.from(s.reportJobs)
			.where(and(eq(s.reportJobs.agency_id, agency), eq(s.reportJobs.id, id)))
	);
	const path = job.storage_path!;
	let releasePut!: () => void, putStarted!: () => void;
	let releaseCleanup!: () => void, removeStarted!: () => void;
	const putting = new Promise<void>((resolve) => {
		putStarted = resolve;
	});
	const putReleased = new Promise<void>((resolve) => {
		releasePut = resolve;
	});
	const removing = new Promise<void>((resolve) => {
		removeStarted = resolve;
	});
	const cleanupReleased = new Promise<void>((resolve) => {
		releaseCleanup = resolve;
	});
	pendingReleases.add(releasePut);
	pendingReleases.add(releaseCleanup);
	beforePut = async () => {
		putStarted();
		await putReleased;
	};
	let blocked = false;
	afterRemove = async (removedPath) => {
		if (removedPath !== path || blocked) return;
		blocked = true;
		removeStarted();
		await cleanupReleased;
	};
	const generating = generate(id);
	let cleanup: Promise<unknown> | undefined;
	try {
		await putting;
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(job.expires_at!.getTime() + 1000));
		cleanup = integration.cleanupReports();
		await removing; // Old cleanup removed the absent file but has not cleared its old pointer.
		failNextRemove = true;
		releasePut();
		expect(await generating).toMatchObject({ status: 'failed' });
		expect(files.has(path)).toBe(true);
		releaseCleanup();
		await cleanup;
		const [failed] = await withService((tx) =>
			tx
				.select({ path: s.reportJobs.storage_path })
				.from(s.reportJobs)
				.where(and(eq(s.reportJobs.agency_id, agency), eq(s.reportJobs.id, id)))
		);
		expect(failed.path).toBe(path);
		afterRemove = undefined;
		await integration.cleanupReports();
		expect(files.has(path)).toBe(false);
	} finally {
		beforePut = undefined;
		afterRemove = undefined;
		failNextRemove = false;
		releasePut();
		releaseCleanup();
		await generating;
		await cleanup;
		vi.useRealTimers();
		pendingReleases.delete(releasePut);
		pendingReleases.delete(releaseCleanup);
	}
});

it('recovers only accessible own Care jobs with safe status fields for the current home and profile', async () => {
	const { id } = await queue();
	const colleagueJob = await (
		await as(colleague)
	).report.requestBackground({ ...input, expectedProfileId: colleague });
	const [source] = await withService((tx) =>
		tx
			.select()
			.from(s.reportJobs)
			.where(and(eq(s.reportJobs.agency_id, agency), eq(s.reportJobs.id, id)))
	);
	const [apiJob, otherHomeJob, foreignJob] = Array.from({ length: 3 }, () => randomUUID());
	const params = source.params as { kind: string; input: Record<string, unknown> };
	await withService((tx) =>
		tx.insert(s.reportJobs).values([
			{
				...source,
				id: apiJob,
				type: 'notes',
				format: 'csv',
				params: { from: '2026-03-01', to: '2026-03-01' }
			},
			{
				...source,
				id: otherHomeJob,
				params: { ...params, input: { ...params.input, homeId: nextHome, clientId: undefined } }
			},
			{
				...source,
				id: foreignJob,
				agency_id: foreignAgency,
				requested_by: foreignOwner,
				params: { ...params, input: { ...params.input, homeId: foreignHome, clientId: undefined } }
			}
		])
	);
	const request = { expectedProfileId: owner, homeId: home };
	const jobs = await (await as()).report.recentBackground(request);
	expect(jobs.some((job) => job.id === id)).toBe(true);
	expect(jobs.length).toBeLessThanOrEqual(20);
	for (const hidden of [colleagueJob.id, apiJob, otherHomeJob, foreignJob])
		expect(jobs.some((job) => job.id === hidden)).toBe(false);
	const allowed = new Set([
		'id',
		'type',
		'format',
		'status',
		'createdAt',
		'expiresAt',
		'error',
		'rows',
		'homeId',
		'clientId',
		'fromDay',
		'toDay',
		'approvedOnly'
	]);
	for (const job of jobs) expect(Object.keys(job).every((key) => allowed.has(key))).toBe(true);
	await expect(
		(await as()).report.recentBackground({ ...request, expectedProfileId: colleague })
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
	await expect(
		(await as()).report.recentBackground({ ...request, homeId: foreignHome })
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
	await expect(
		(await as(caregiver)).report.recentBackground({ ...request, expectedProfileId: caregiver })
	).rejects.toMatchObject({ code: 'FORBIDDEN' });
	const user = (await getCurrentUser(uid(owner)))!;
	const withoutReports = caller({
		user: { ...user, features: user.features.filter((feature) => feature !== 'reports') },
		request: {}
	});
	await expect(withoutReports.report.recentBackground(request)).rejects.toMatchObject({
		code: 'FORBIDDEN'
	});
	const withoutHealth = caller({
		user: { ...user, features: user.features.filter((feature) => feature !== 'health') },
		request: {}
	});
	const restricted = await withoutHealth.report.recentBackground(request);
	expect(restricted.some((job) => job.id === id)).toBe(false);
	await withService((tx) =>
		tx
			.update(s.profiles)
			.set({ home_ids: [nextHome] })
			.where(and(eq(s.profiles.agency_id, agency), eq(s.profiles.id, owner)))
	);
	try {
		await expect((await as()).report.recentBackground(request)).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	} finally {
		await withService((tx) =>
			tx
				.update(s.profiles)
				.set({ home_ids: [home] })
				.where(and(eq(s.profiles.agency_id, agency), eq(s.profiles.id, owner)))
		);
	}
});
