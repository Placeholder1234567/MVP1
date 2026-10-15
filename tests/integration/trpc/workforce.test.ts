import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeDb, withService } from '../../../src/lib/server/db';
import * as s from '../../../src/lib/server/db/schema';
import { getCurrentUser } from '../../../src/lib/server/services/auth';
import { appRouter } from '../../../src/lib/server/trpc/router';
import { createCallerFactory } from '../../../src/lib/server/trpc/middleware';
import { localTime, addDays } from '../../../src/lib/domain';
import { runJob } from '../../../src/lib/server/jobs/registry';
import { and, eq } from 'drizzle-orm';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
const agency = randomUUID(),
	otherAgency = randomUUID(),
	oak = randomUUID(),
	maple = randomUUID(),
	foreignHome = randomUUID();
const cara = randomUUID(),
	dev = randomUUID(),
	sam = randomUUID();
const eli = randomUUID(),
	bea = randomUUID();
const uid = (id: string) => `workforce-${id}`;
const caller = createCallerFactory(appRouter);
const as = async (id: string) => caller({ user: await getCurrentUser(uid(id)), request: {} });
const day = addDays(localTime(new Date(), 'America/New_York').day, 1);
beforeAll(async () => {
	await withService(async (tx) => {
		await tx.insert(s.agencies).values([
			{ id: agency, name: 'Workforce Test', slug: `work-${agency}` },
			{ id: otherAgency, name: 'Other Workforce', slug: `work-${otherAgency}` }
		]);
		await tx.insert(s.homes).values([
			{ id: oak, agency_id: agency, name: 'Oak', lat: 40, lng: -75, radius: 150 },
			{ id: maple, agency_id: agency, name: 'Maple', lat: 41, lng: -75, radius: 150 },
			{ id: foreignHome, agency_id: otherAgency, name: 'Other', lat: 40, lng: -75, radius: 150 }
		]);
		await tx.insert(s.profiles).values([
			...[eli, bea].map((id) => ({
				id,
				agency_id: agency,
				auth_uid: uid(id),
				email: `${id}@example.test`,
				name: 'Available Test Caregiver',
				role: 'caregiver' as const,
				home_ids: [oak, maple],
				med_certified: true
			})),
			{
				id: cara,
				agency_id: agency,
				auth_uid: uid(cara),
				email: `${cara}@example.test`,
				name: 'Test Caregiver',
				role: 'caregiver',
				home_ids: [oak, maple]
			},
			{
				id: dev,
				agency_id: agency,
				auth_uid: uid(dev),
				email: `${dev}@example.test`,
				name: 'Other Caregiver',
				role: 'caregiver',
				home_ids: [maple]
			},
			{
				id: sam,
				agency_id: agency,
				auth_uid: uid(sam),
				email: `${sam}@example.test`,
				name: 'Test Supervisor',
				role: 'supervisor',
				home_ids: [oak, maple]
			}
		]);
	});
});
afterAll(closeDb);

it('manual entries cannot overlap and timesheets clip hours at period boundaries', async () => {
	const supervisor = await as(sam);
	const end = new Date(Date.now() - 48 * 3600000),
		start = new Date(end.getTime() - 4 * 3600000);
	const entry = await supervisor.clock.manualEntry({
		profileId: dev,
		homeId: maple,
		clockInAt: start,
		clockOutAt: end,
		reason: 'Synthetic missed-punch correction'
	});
	expect(entry.manual_override).toBe(true);
	expect(entry.acknowledged).toBe(false);
	await expect(
		supervisor.clock.manualEntry({
			profileId: dev,
			homeId: maple,
			clockInAt: start,
			clockOutAt: end,
			reason: 'Duplicate correction'
		})
	).rejects.toMatchObject({ code: 'CONFLICT' });
	const report = await supervisor.clock.timesheet({
		profileId: dev,
		dateRange: { from: new Date(start.getTime() + 3600000), to: new Date(end.getTime() - 3600000) }
	});
	expect(report.totalHours).toBe(2);
	expect(report.manualHours).toBe(2);
	expect((await supervisor.clock.acknowledge({ id: entry.id })).acknowledged).toBe(true);
});

it('missed-punch checks notify once and do not repeat on subsequent sweeps', async () => {
	const user = await as(dev);
	const id = randomUUID();
	await user.sync.upload({
		transactionId: 60,
		ops: [
			{
				op: 'PUT',
				table: 'clock_records',
				id,
				data: { home_id: maple, clock_in_at: new Date(Date.now() - 10 * 3600000).toISOString() }
			}
		]
	});
	await runJob('missed-punch-check', {}, { attempt: 0, final: true });
	const count = async () =>
		(
			await withService((tx) =>
				tx
					.select()
					.from(s.notifications)
					.where(
						and(
							eq(s.notifications.agency_id, agency),
							eq(s.notifications.reference_id, id),
							eq(s.notifications.type, 'clock_missed')
						)
					)
			)
		).length;
	const first = await count();
	expect(first).toBeGreaterThan(0);
	await runJob('missed-punch-check', {}, { attempt: 1, final: true });
	expect(await count()).toBe(first);
	await user.clock.clockOut({});
});

it('offers only eligible caregivers and the first acceptance wins atomically', async () => {
	const supervisor = await as(sam);
	const original = await as(cara);
	await supervisor.schedule.setSlot({ homeId: oak, day, shift: 'pm', profileId: cara });
	await expect(
		(await as(dev)).coverage.callout({ homeId: oak, day, shift: 'pm' })
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
	const request = await original.coverage.callout({ homeId: oak, day, shift: 'pm' });
	await runJob(
		'coverage-search',
		{ agencyId: agency, id: request.id },
		{ attempt: 0, final: true }
	);
	expect(await original.coverage.offers()).toEqual([]);
	expect((await (await as(eli)).coverage.offers()).map((o) => o.id)).toContain(request.id);
	const first = await as(eli),
		second = await as(bea);
	const replies = await Promise.allSettled([
		first.coverage.accept({ id: request.id }),
		second.coverage.accept({ id: request.id })
	]);
	expect(replies.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
	expect(replies.filter((r) => r.status === 'rejected')).toHaveLength(1);
	const slots = await supervisor.schedule.get({ homeId: oak, weekStart: day });
	expect([eli, bea]).toContain(
		slots.slots.find((s) => s.day === day && s.shift === 'pm')?.assigned_to
	);
});

it('sends a reminder once and a timed-out request becomes a supervisor action', async () => {
	const supervisor = await as(sam);
	const request = await supervisor.schedule.postOpen({ homeId: maple, day, shift: 'on' });
	const payload = { agencyId: agency, id: request.id };
	await runJob('coverage-search', payload, { attempt: 0, final: true });
	await runJob('coverage-reminder', payload, { attempt: 0, final: true });
	await runJob('coverage-reminder', payload, { attempt: 1, final: true });
	const steps = await withService((tx) =>
		tx
			.select()
			.from(s.coverageSteps)
			.where(
				and(
					eq(s.coverageSteps.agency_id, agency),
					eq(s.coverageSteps.coverage_request_id, request.id)
				)
			)
	);
	expect(steps.filter((s) => s.description === 'Offer reminder sent')).toHaveLength(1);
	await runJob('coverage-timeout', payload, { attempt: 0, final: true });
	const result = await withService((tx) =>
		tx
			.select()
			.from(s.coverageRequests)
			.where(and(eq(s.coverageRequests.agency_id, agency), eq(s.coverageRequests.id, request.id)))
	);
	expect(result[0].status).toBe('unfilled');
});

it('verifies location server-side and records a clock-out', async () => {
	const user = await as(cara);
	const record = await user.clock.clockIn({ homeId: oak, lat: 40, lng: -75 });
	expect(record.verified).toBe(true);
	expect(record.distance_meters).toBe(0);
	expect((await user.clock.clockOut({})).clock_out_at).toBeInstanceOf(Date);
});
it('serializes simultaneous punches so only one active record is created', async () => {
	const user = await as(cara);
	const results = await Promise.allSettled([
		user.clock.clockIn({ homeId: oak }),
		user.clock.clockIn({ homeId: oak })
	]);
	expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
	expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
	await user.clock.clockOut({});
});
it('offline punches ignore forged verification and another profile cannot close them', async () => {
	const user = await as(cara);
	const id = randomUUID();
	const now = new Date().toISOString();
	const result = await user.sync.upload({
		transactionId: 30,
		ops: [
			{
				op: 'PUT',
				table: 'clock_records',
				id,
				data: { home_id: oak, clock_in_at: now, verified: 1, profile_id: dev }
			}
		]
	});
	expect(result.rejected).toEqual([]);
	const rows = await user.clock.list({});
	const record = rows.find((r) => r.id === id)!;
	expect(record.profile_id).toBe(cara);
	expect(record.verified).toBe(false);
	const attack = await (
		await as(dev)
	).sync.upload({
		transactionId: 31,
		ops: [
			{ op: 'PATCH', table: 'clock_records', id, data: { clock_out_at: new Date().toISOString() } }
		]
	});
	expect(attack.rejected).toHaveLength(1);
	const done = await user.sync.upload({
		transactionId: 32,
		ops: [
			{ op: 'PATCH', table: 'clock_records', id, data: { clock_out_at: new Date().toISOString() } }
		]
	});
	expect(done.rejected).toEqual([]);
});
it('refuses another agency and hides another caregiver’s clock records', async () => {
	const user = await as(cara);
	await expect(user.clock.clockIn({ homeId: foreignHome })).rejects.toMatchObject({
		code: 'FORBIDDEN'
	});
	const visible = await (await as(dev)).clock.list({ profileId: cara });
	expect(visible.every((row) => row.profile_id === dev)).toBe(true);
});
it('only supervisors assign staff, and training and overlapping homes are checked', async () => {
	const supervisor = await as(sam);
	await expect(
		(await as(cara)).schedule.setSlot({ homeId: oak, day, shift: 'am', profileId: cara })
	).rejects.toMatchObject({ code: 'FORBIDDEN' });
	await expect(
		supervisor.schedule.setSlot({ homeId: oak, day, shift: 'am', profileId: dev })
	).rejects.toMatchObject({ code: 'BAD_REQUEST' });
	await supervisor.schedule.setSlot({ homeId: oak, day, shift: 'am', profileId: cara });
	await expect(
		supervisor.schedule.setSlot({ homeId: maple, day, shift: 'am', profileId: cara })
	).rejects.toMatchObject({ code: 'CONFLICT' });
	expect(
		(await supervisor.schedule.clearSlot({ homeId: oak, day, shift: 'am' })).assigned_to
	).toBeNull();
});
