// Scheduled care reports (report.schedules / createSchedule / deleteSchedule,
// report-schedule-sweep). Synthetic fixtures; queue and storage are in memory.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';

vi.mock('../../../src/lib/server/jobs/queue.ts', () => ({ enqueue: vi.fn(async () => undefined) }));
process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';

const { closeDb, withService } = await import('../../../src/lib/server/db');
const s = await import('../../../src/lib/server/db/schema');
const { getCurrentUser } = await import('../../../src/lib/server/services/auth');
const { appRouter } = await import('../../../src/lib/server/trpc/router');
const { createCallerFactory } = await import('../../../src/lib/server/trpc/middleware');
const { setStorageForTests } = await import('../../../src/lib/server/storage');
const { generateCareReport, sweepReportSchedules } =
	await import('../../../src/lib/server/services/report/index.ts');

const [agency, proAgency, home, otherHome, proHome] = Array.from({ length: 5 }, () => randomUUID());
const [owner, colleague, caregiver, proOwner] = Array.from({ length: 4 }, () => randomUUID());
const uid = (id: string) => `scheduled-report-${id}`;
const files = new Map<string, Buffer>();
const caller = createCallerFactory(appRouter);
const as = async (id: string) => caller({ user: await getCurrentUser(uid(id)), request: {} });
const weekly = {
	type: 'notes' as const,
	format: 'csv' as const,
	frequency: 'weekly' as const,
	weekday: 1
};

beforeAll(async () => {
	setStorageForTests({
		put: async (path, body) => void files.set(path, body),
		get: async (path) => files.get(path) ?? null,
		remove: async (path) => void files.delete(path)
	});
	await withService(async (tx) => {
		await tx.insert(s.agencies).values([
			{
				id: agency,
				slug: `sched-${agency}`,
				name: 'Synthetic',
				subscription_tier: 'complete',
				timezone: 'UTC'
			},
			{
				id: proAgency,
				slug: `sched-${proAgency}`,
				name: 'Synthetic pro',
				subscription_tier: 'professional',
				timezone: 'UTC'
			}
		]);
		await tx.insert(s.homes).values([
			{ id: home, agency_id: agency, name: 'Synthetic home' },
			{ id: otherHome, agency_id: agency, name: 'Synthetic other home' },
			{ id: proHome, agency_id: proAgency, name: 'Synthetic pro home' }
		]);
		await tx.insert(s.profiles).values(
			(
				[
					[owner, agency, 'supervisor', home],
					[colleague, agency, 'supervisor', home],
					[caregiver, agency, 'caregiver', home],
					[proOwner, proAgency, 'supervisor', proHome]
				] as const
			).map(([id, agencyId, role, homeId]) => ({
				id,
				agency_id: agencyId,
				auth_uid: uid(id),
				email: `${id}@example.test`,
				name: 'Synthetic staff',
				role,
				home_ids: [homeId]
			}))
		);
	});
});

afterAll(closeDb);

const scheduleRow = (id: string) =>
	withService(
		async (tx) => (await tx.select().from(s.reportSchedules).where(eq(s.reportSchedules.id, id)))[0]
	);
const jobsFor = (scheduleId: string) =>
	withService(async (tx) =>
		(await tx.select().from(s.reportJobs).where(eq(s.reportJobs.requested_by, owner))).filter(
			(j) => (j.params as { scheduleId?: string }).scheduleId === scheduleId
		)
	);
const makeDue = (id: string, day: string) =>
	withService((tx) =>
		tx.update(s.reportSchedules).set({ next_run_on: day }).where(eq(s.reportSchedules.id, id))
	);

it('is on the Complete plan, for supervisors, for their own homes', async () => {
	await expect(
		(await as(proOwner)).report.createSchedule({ ...weekly, homeId: proHome })
	).rejects.toThrow();
	await expect(
		(await as(caregiver)).report.createSchedule({ ...weekly, homeId: home })
	).rejects.toThrow();
	await expect(
		(await as(owner)).report.createSchedule({ ...weekly, homeId: otherHome })
	).rejects.toThrow();
});

it('runs each due schedule once, as its owner, for the week before, and says when it is ready', async () => {
	const created = await (await as(owner)).report.createSchedule({ ...weekly, homeId: home });
	expect(created.active).toBe(true);
	// Owners see only their own.
	expect((await (await as(owner)).report.schedules()).map((x) => x.id)).toContain(created.id);
	expect((await (await as(colleague)).report.schedules()).map((x) => x.id)).not.toContain(
		created.id
	);

	// Due on Monday 2026-10-19 (UTC). Not built before 09:00, after the
	// overnight shift; then built once that morning.
	await makeDue(created.id, '2026-10-19');
	await sweepReportSchedules(new Date('2026-10-19T06:00:00Z'));
	expect(await jobsFor(created.id)).toHaveLength(0);
	const monday = new Date('2026-10-19T10:00:00Z');
	expect((await sweepReportSchedules(monday)).queued).toBeGreaterThanOrEqual(1);
	await sweepReportSchedules(monday);
	const jobs = await jobsFor(created.id);
	expect(jobs).toHaveLength(1);
	const params = jobs[0].params as { input: { fromDay: string; toDay: string; homeId: string } };
	expect(params.input).toMatchObject({ fromDay: '2026-10-12', toDay: '2026-10-18', homeId: home });
	expect(await scheduleRow(created.id)).toMatchObject({
		next_run_on: '2026-10-26',
		last_run_on: '2026-10-19',
		last_report_id: jobs[0].id,
		active: true
	});

	expect(await generateCareReport({ id: jobs[0].id })).toEqual({ status: 'ready' });
	// Kept 7 days once ready, not the usual 24 hours.
	const [built] = await jobsFor(created.id);
	expect(built.expires_at!.getTime() - Date.now()).toBeGreaterThan(6 * 86_400_000);
	const alerts = await withService((tx) =>
		tx
			.select()
			.from(s.notifications)
			.where(and(eq(s.notifications.profile_id, owner), eq(s.notifications.type, 'report_ready')))
	);
	expect(alerts.length).toBeGreaterThan(0);
	expect(alerts[0].title).toBe(
		'Your scheduled report is ready: Signed notes, 2026-10-12 to 2026-10-18'
	);
	expect(alerts[0].reference_id).toBe(jobs[0].id);
});

it('switches a schedule off when its owner loses access to the home', async () => {
	const created = await (
		await as(owner)
	).report.createSchedule({
		...weekly,
		homeId: home,
		type: 'mar'
	});
	await withService((tx) =>
		tx
			.update(s.profiles)
			.set({ home_ids: [otherHome] })
			.where(eq(s.profiles.id, owner))
	);
	await makeDue(created.id, '2026-10-19');
	await sweepReportSchedules(new Date('2026-10-19T10:00:00Z'));
	expect(await jobsFor(created.id)).toHaveLength(0);
	expect((await scheduleRow(created.id)).active).toBe(false);
	// Still stopped while access is missing; back on once it returns.
	await expect((await as(owner)).report.resumeSchedule({ id: created.id })).rejects.toThrow();
	await withService((tx) =>
		tx
			.update(s.profiles)
			.set({ home_ids: [home] })
			.where(eq(s.profiles.id, owner))
	);
	const resumed = await (await as(owner)).report.resumeSchedule({ id: created.id });
	expect(resumed.active).toBe(true);
	expect(resumed.nextRunOn > '2026-10-19').toBe(true);
	await (await as(owner)).report.deleteSchedule({ id: created.id });
	await expect((await as(owner)).report.deleteSchedule({ id: created.id })).rejects.toThrow(
		'not found'
	);
});

it('tells the owner when a scheduled report could not be built', async () => {
	const created = await (
		await as(owner)
	).report.createSchedule({
		...weekly,
		homeId: home,
		type: 'health'
	});
	await makeDue(created.id, '2026-10-19');
	await sweepReportSchedules(new Date('2026-10-19T10:00:00Z'));
	const [job] = await jobsFor(created.id);
	setStorageForTests({
		put: async () => {
			throw new Error('Synthetic storage failure');
		},
		get: async () => null,
		remove: async () => {}
	});
	expect(await generateCareReport({ id: job.id })).toEqual({ status: 'failed' });
	const [alert] = await withService((tx) =>
		tx
			.select()
			.from(s.notifications)
			.where(and(eq(s.notifications.profile_id, owner), eq(s.notifications.reference_id, job.id)))
	);
	expect(alert.title).toBe(
		'Your scheduled report could not be built: Health entries, 2026-10-12 to 2026-10-18. Download it by hand from Reports.'
	);
});
