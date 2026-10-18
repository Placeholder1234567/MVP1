import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeDb, withService } from '../../../src/lib/server/db';
import * as s from '../../../src/lib/server/db/schema';
import { getCurrentUser } from '../../../src/lib/server/services/auth';
import { appRouter } from '../../../src/lib/server/trpc/router';
import { createCallerFactory } from '../../../src/lib/server/trpc/middleware';
import { localTime, addDays, weekStart } from '../../../src/lib/domain';
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
			{ id: agency, name: 'Workforce Test', subscription_tier: 'complete', slug: `work-${agency}` },
			{
				id: otherAgency,
				name: 'Other Workforce',
				subscription_tier: 'complete',
				slug: `work-${otherAgency}`
			}
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

it('exports audited payroll CSV and JSON with clipped totals and no location or reason payloads', async () => {
	const supervisor = await as(sam);
	const from = new Date('2025-02-01T00:00:00Z'),
		to = new Date('2025-02-02T00:00:00Z');
	const row = await supervisor.clock.manualEntry({
		profileId: cara,
		homeId: oak,
		clockInAt: new Date('2025-01-31T23:00:00Z'),
		clockOutAt: new Date('2025-02-01T02:00:00Z'),
		reason: 'Private correction explanation'
	});
	const file = await supervisor.report.exportTimesheet({ homeId: oak, from, to, format: 'json' });
	const report = JSON.parse(file.content);
	expect(report.totals).toEqual({
		totalHours: 2,
		verifiedHours: 0,
		unverifiedHours: 0,
		manualHours: 2
	});
	expect(report.entries).toHaveLength(1);
	expect(report.entries[0]).toMatchObject({ id: row.id, hours: 2, staffId: cara, homeId: oak });
	expect(file.content).not.toContain('Private correction');
	expect(file.content).not.toContain('clock_in_lat');
	const csv = await supervisor.report.exportTimesheet({ homeId: oak, from, to, format: 'csv' });
	expect(csv.content).toContain('Hours in report period');
	expect(csv.content).toContain(row.id);
	const audit = await withService((tx) =>
		tx
			.select()
			.from(s.auditLog)
			.where(and(eq(s.auditLog.agency_id, agency), eq(s.auditLog.table_name, 'report_exports')))
	);
	expect(audit).toHaveLength(2);
	expect(audit.every((r) => r.performed_by === sam)).toBe(true);
	expect(audit.map((r) => r.new_values)).toEqual(
		expect.arrayContaining([
			{ type: 'timesheets', format: 'csv', rows: 1 },
			{ type: 'timesheets', format: 'json', rows: 1 }
		])
	);
});

it('blocks caregivers, invalid/oversized ranges and foreign-tenant payroll filters', async () => {
	const input = {
		from: new Date('2025-02-01T00:00:00Z'),
		to: new Date('2025-02-02T00:00:00Z'),
		format: 'json' as const
	};
	await expect((await as(cara)).report.exportTimesheet(input)).rejects.toMatchObject({
		code: 'FORBIDDEN'
	});
	const supervisor = await as(sam);
	for (const to of [input.from, new Date('2024-01-01'), new Date('2027-01-01')])
		await expect(supervisor.report.exportTimesheet({ ...input, to })).rejects.toMatchObject({
			code: 'BAD_REQUEST'
		});
	const otherStaff = randomUUID();
	await withService(async (tx) => {
		await tx.insert(s.profiles).values({
			id: otherStaff,
			agency_id: otherAgency,
			auth_uid: uid(otherStaff),
			email: `${otherStaff}@example.test`,
			name: 'Foreign payroll staff',
			role: 'caregiver',
			home_ids: [foreignHome]
		});
		await tx.insert(s.clockRecords).values({
			agency_id: otherAgency,
			profile_id: otherStaff,
			home_id: foreignHome,
			clock_in_at: input.from,
			clock_out_at: input.to,
			manual_override: true,
			reason: 'Foreign record'
		});
	});
	const foreign = await supervisor.report.exportTimesheet({ ...input, homeId: foreignHome });
	expect(JSON.parse(foreign.content).entries).toEqual([]);
	expect(foreign.content).not.toContain('Foreign payroll staff');
	const allHomes = await supervisor.report.exportTimesheet(input);
	expect(allHomes.content).not.toContain(otherStaff);
	const current = await getCurrentUser(uid(sam));
	for (const features of [[], ['reports_basic'], ['timekeeping']] as const) {
		const denied = caller({ user: { ...current!, features: [...features] }, request: {} });
		await expect(denied.report.exportTimesheet(input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
	}
});

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
	// The activity log shows who was offered, why others weren't, and each reply.
	const detail = await supervisor.coverage.get({ id: request.id });
	const byId = new Map(detail.candidates.map((c) => [c.profileId, c]));
	expect(byId.get(cara)).toMatchObject({ eligible: false, reason: 'called_out' });
	expect(byId.get(dev)).toMatchObject({ eligible: false, reason: 'not_trained_at_home' });
	expect([byId.get(eli)?.reply, byId.get(bea)?.reply]).toContain('accepted');
	expect(detail.candidates.find((c) => c.reply === 'accepted')?.repliedAt).toBeInstanceOf(Date);
	await expect(original.coverage.get({ id: request.id })).rejects.toMatchObject({
		code: 'FORBIDDEN'
	});
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

it('copies last week into open slots, keeps assigned ones and skips double bookings', async () => {
	const supervisor = await as(sam);
	const from = weekStart(addDays(day, 28));
	const to = addDays(from, 7);
	for (const [d, shift] of [
		[0, 'am'],
		[1, 'am'],
		[2, 'pm']
	] as const)
		await supervisor.schedule.setSlot({
			homeId: oak,
			day: addDays(from, d),
			shift,
			profileId: cara
		});
	// Next week: Tuesday morning is already Sam's, and Monday morning Cara works at Maple.
	await supervisor.schedule.setSlot({
		homeId: oak,
		day: addDays(to, 1),
		shift: 'am',
		profileId: sam
	});
	await supervisor.schedule.setSlot({ homeId: maple, day: to, shift: 'am', profileId: cara });

	await expect(
		(await as(cara)).schedule.copyWeek({ homeId: oak, fromWeek: from, toWeek: to })
	).rejects.toMatchObject({ code: 'FORBIDDEN' });
	await expect(
		supervisor.schedule.copyWeek({ homeId: oak, fromWeek: from, toWeek: addDays(to, 1) })
	).rejects.toMatchObject({ code: 'BAD_REQUEST' });

	const result = await supervisor.schedule.copyWeek({ homeId: oak, fromWeek: from, toWeek: to });
	expect(result.copied).toBe(1);
	expect(result.skipped).toEqual(
		expect.arrayContaining([
			{ day: addDays(to, 1), shift: 'am', reason: 'already-assigned' },
			{ day: to, shift: 'am', reason: 'unavailable' }
		])
	);
	const week = await supervisor.schedule.get({ homeId: oak, weekStart: to });
	const by = (d: number, shift: string) =>
		week.slots.find((s) => s.day === addDays(to, d) && s.shift === shift)?.assigned_to ?? null;
	expect([by(0, 'am'), by(1, 'am'), by(2, 'pm')]).toEqual([null, sam, cara]);
	// Copying again changes nothing.
	expect(
		(await supervisor.schedule.copyWeek({ homeId: oak, fromWeek: from, toWeek: to })).copied
	).toBe(0);
});

it('saves a week as a template and applies it to the open slots of another week', async () => {
	const supervisor = await as(sam);
	const from = weekStart(addDays(day, 56));
	const to = addDays(from, 14);
	await supervisor.schedule.setSlot({
		homeId: oak,
		day: addDays(from, 0),
		shift: 'am',
		profileId: cara
	});
	await supervisor.schedule.setSlot({
		homeId: oak,
		day: addDays(from, 3),
		shift: 'pm',
		profileId: sam
	});

	await expect(
		(await as(cara)).schedule.saveTemplate({ homeId: oak, name: 'Usual week', fromWeek: from })
	).rejects.toMatchObject({ code: 'FORBIDDEN' });
	await expect(
		supervisor.schedule.saveTemplate({ homeId: oak, name: 'Empty', fromWeek: addDays(from, 70) })
	).rejects.toMatchObject({ code: 'BAD_REQUEST' });
	const saved = await supervisor.schedule.saveTemplate({
		homeId: oak,
		name: 'Usual week',
		fromWeek: from
	});
	expect(saved.shifts).toBe(2);
	// Saving under the same name replaces it.
	expect(
		(await supervisor.schedule.saveTemplate({ homeId: oak, name: 'Usual week', fromWeek: from })).id
	).toBe(saved.id);
	expect(await supervisor.schedule.templates({ homeId: oak })).toEqual([
		expect.objectContaining({ id: saved.id, name: 'Usual week', shifts: 2 })
	]);
	expect(await supervisor.schedule.templates({ homeId: maple })).toEqual([]);

	// Thursday evening in the target week is already Cara's: it stays.
	await supervisor.schedule.setSlot({
		homeId: oak,
		day: addDays(to, 3),
		shift: 'pm',
		profileId: cara
	});
	const result = await supervisor.schedule.applyTemplate({ id: saved.id, toWeek: to });
	expect(result.copied).toBe(1);
	expect(result.skipped).toEqual([
		{ day: addDays(to, 3), shift: 'pm', reason: 'already-assigned' }
	]);
	const week = await supervisor.schedule.get({ homeId: oak, weekStart: to });
	const by = (d: number, shift: string) =>
		week.slots.find((s) => s.day === addDays(to, d) && s.shift === shift)?.assigned_to ?? null;
	expect([by(0, 'am'), by(3, 'pm')]).toEqual([cara, cara]);

	await expect(supervisor.schedule.deleteTemplate({ id: saved.id })).resolves.toEqual({
		deleted: true
	});
	await expect(
		supervisor.schedule.applyTemplate({ id: saved.id, toWeek: to })
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

it('suggests eligible staff for open shifts without double-booking, and applies only what is kept', async () => {
	const supervisor = await as(sam);
	const week = weekStart(addDays(day, 84));
	await expect(
		(await as(cara)).schedule.suggest({ homeId: oak, weekStart: week })
	).rejects.toMatchObject({ code: 'FORBIDDEN' });

	const suggestions = await supervisor.schedule.suggest({ homeId: oak, weekStart: week });
	expect(suggestions).toHaveLength(21);
	const picked = suggestions.filter((x) => x.profileId);
	// Only caregivers trained at Oak; never twice in a day; at most five shifts each.
	expect(new Set(picked.map((x) => x.profileId))).toEqual(new Set([eli, bea, cara]));
	for (const d of new Set(picked.map((x) => x.day))) {
		const that = picked.filter((x) => x.day === d).map((x) => x.profileId);
		expect(new Set(that).size).toBe(that.length);
	}
	for (const id of [eli, bea, cara])
		expect(picked.filter((x) => x.profileId === id).length).toBeLessThanOrEqual(5);
	expect(suggestions.filter((x) => !x.profileId).every((x) => x.reason)).toBe(true);
	// Nothing was assigned by suggesting.
	expect(
		(await supervisor.schedule.get({ homeId: oak, weekStart: week })).slots.filter(
			(s) => s.assigned_to
		)
	).toEqual([]);

	const keep = picked
		.slice(0, 2)
		.map((x) => ({ day: x.day, shift: x.shift, profileId: x.profileId! }));
	expect(
		(await supervisor.schedule.applySuggestions({ homeId: oak, weekStart: week, picks: keep }))
			.copied
	).toBe(2);
	const after = await supervisor.schedule.get({ homeId: oak, weekStart: week });
	for (const k of keep)
		expect(after.slots.find((s) => s.day === k.day && s.shift === k.shift)?.assigned_to).toBe(
			k.profileId
		);
	// A stale pick is checked again: the person now works that day, so it is skipped.
	const taken = new Set(keep.filter((k) => k.day === keep[0].day).map((k) => k.shift));
	const free = (['am', 'pm', 'on'] as const).find((sh) => !taken.has(sh))!;
	const stale = await supervisor.schedule.applySuggestions({
		homeId: oak,
		weekStart: week,
		picks: [{ day: keep[0].day, shift: free, profileId: keep[0].profileId }]
	});
	expect(stale).toEqual({
		copied: 0,
		skipped: [{ day: keep[0].day, shift: free, reason: 'unavailable' }]
	});
	await expect(
		supervisor.schedule.applySuggestions({
			homeId: oak,
			weekStart: week,
			picks: [{ day: addDays(week, 7), shift: 'am', profileId: eli }]
		})
	).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});

it('a pick for a shift taken since is skipped with its reason and does not block the others', async () => {
	const supervisor = await as(sam);
	const week = weekStart(addDays(day, 98));
	const monday = addDays(week, 1);
	// After the suggestion, Bea is put on Monday morning by hand.
	await supervisor.schedule.setSlot({ homeId: oak, day: monday, shift: 'am', profileId: bea });
	const result = await supervisor.schedule.applySuggestions({
		homeId: oak,
		weekStart: week,
		picks: [
			{ day: monday, shift: 'am', profileId: eli },
			{ day: monday, shift: 'pm', profileId: eli }
		]
	});
	expect(result).toEqual({
		copied: 1,
		skipped: [{ day: monday, shift: 'am', reason: 'already-assigned' }]
	});
	const after = await supervisor.schedule.get({ homeId: oak, weekStart: week });
	expect(after.slots.find((s) => s.day === monday && s.shift === 'pm')?.assigned_to).toBe(eli);
});
