import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, withService } from '../../../src/lib/server/db';
import * as s from '../../../src/lib/server/db/schema';
import { getCurrentUser } from '../../../src/lib/server/services/auth';
import { createCallerFactory } from '../../../src/lib/server/trpc/middleware';
import { appRouter } from '../../../src/lib/server/trpc/router';
import { localTime } from '../../../src/lib/domain/time';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
const caller = createCallerFactory(appRouter);
const agency = randomUUID(),
	foreignAgency = randomUUID(),
	home = randomUUID(),
	foreignHome = randomUUID();
const person = randomUUID(),
	inactive = randomUUID(),
	foreignPerson = randomUUID();
const supervisor = randomUUID(),
	caregiver = randomUUID(),
	admin = randomUUID();
const uid = (id: string) => `medication-management-${id}`;
const as = async (id: string) => caller({ user: await getCurrentUser(uid(id)), request: {} });
const scheduled = {
	clientId: person,
	name: 'Synthetic medication',
	dose: '1 tablet',
	route: 'By mouth',
	scheduledTimes: ['08:00', '20:00']
};
beforeAll(async () => {
	await withService(async (tx) => {
		await tx.insert(s.agencies).values([
			{
				id: agency,
				name: 'Synthetic medication agency',
				slug: `med-${agency}`,
				subscription_tier: 'complete'
			},
			{
				id: foreignAgency,
				name: 'Foreign synthetic agency',
				slug: `med-${foreignAgency}`,
				subscription_tier: 'complete'
			}
		]);
		await tx.insert(s.homes).values([
			{ id: home, agency_id: agency, name: 'Synthetic home' },
			{ id: foreignHome, agency_id: foreignAgency, name: 'Foreign home' }
		]);
		await tx.insert(s.clients).values([
			{ id: person, agency_id: agency, home_id: home, name: 'Synthetic person' },
			{ id: inactive, agency_id: agency, home_id: home, name: 'Inactive person', active: false },
			{ id: foreignPerson, agency_id: foreignAgency, home_id: foreignHome, name: 'Foreign person' }
		]);
		await tx.insert(s.profiles).values(
			(
				[
					['supervisor', supervisor],
					['caregiver', caregiver],
					['admin', admin]
				] as const
			).map(([role, id]) => ({
				id,
				agency_id: agency,
				auth_uid: uid(id),
				email: `${id}@example.test`,
				name: `Medication ${role}`,
				role,
				home_ids: [home],
				med_certified: true
			}))
		);
	});
});
afterAll(closeDb);

it('creates, updates and stops with actor history/audit while preserving every stored MAR field', async () => {
	const staff = await as(supervisor);
	const created = await staff.medication.create({
		...scheduled,
		scheduledTimes: ['20:00', '08:00', '08:00'],
		startedAt: new Date('2020-01-01T00:00:00Z')
	});
	expect(created).toMatchObject({
		...scheduled,
		scheduledTimes: ['08:00', '20:00'],
		stoppedAt: null
	});
	expect(
		await withService((tx) =>
			tx
				.select({ homeId: s.medications.home_id })
				.from(s.medications)
				.where(and(eq(s.medications.agency_id, agency), eq(s.medications.id, created.id)))
		)
	).toEqual([{ homeId: home }]);
	const user = (await getCurrentUser(uid(supervisor)))!;
	const dose = await staff.mar.record({
		clientId: person,
		medicationId: created.id,
		day: localTime(new Date(), user.timeZone).day,
		scheduledTime: '08:00',
		status: 'given'
	});
	const storedMar = () =>
		withService((tx) =>
			tx
				.select()
				.from(s.marRecords)
				.where(and(eq(s.marRecords.agency_id, agency), eq(s.marRecords.id, dose.id)))
		);
	const before = await storedMar();
	await staff.medication.update({ id: created.id, dose: '2 tablets', notes: 'With food' });
	const stopped = await staff.medication.stop({ id: created.id });
	expect(stopped.stoppedAt).toBeInstanceOf(Date);
	expect(await staff.medication.stop({ id: created.id })).toEqual(stopped);
	await expect(staff.medication.update({ id: created.id, notes: 'Denied' })).rejects.toMatchObject({
		code: 'CONFLICT'
	});
	expect(await storedMar()).toEqual(before);
	expect(
		(await staff.medication.list({ clientId: person })).some((row) => row.id === created.id)
	).toBe(false);
	expect(
		(await staff.medication.list({ clientId: person, includeStopped: true })).some(
			(row) => row.id === created.id
		)
	).toBe(true);
	const history = await staff.medication.history({ medicationId: created.id });
	expect(history.map((row) => row.action)).toEqual(['stopped', 'updated', 'added']);
	expect(
		history.every(
			(row) => row.changedBy === supervisor && row.changedByName === 'Medication supervisor'
		)
	).toBe(true);
	const audit = await withService((tx) =>
		tx
			.select()
			.from(s.auditLog)
			.where(
				and(
					eq(s.auditLog.agency_id, agency),
					eq(s.auditLog.table_name, 'medications'),
					eq(s.auditLog.record_id, created.id)
				)
			)
	);
	expect(audit).toHaveLength(3);
	expect(audit.every((row) => row.performed_by === supervisor)).toBe(true);
	expect(
		audit.find(
			(row) =>
				(row.old_values as { dose?: string } | null)?.dose === '1 tablet' &&
				(row.new_values as { dose?: string } | null)?.dose === '2 tablets'
		)
	).toBeDefined();
});

it('validates merged schedule/PRN transitions atomically without failed-write history', async () => {
	const staff = await as(supervisor);
	for (const input of [
		{ clientId: person, name: 'No instructions' },
		{ ...scheduled, prnInstructions: 'Mixed instructions' },
		{ ...scheduled, startedAt: new Date(Date.now() + 60_000) }
	])
		await expect(staff.medication.create(input)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
	const created = await staff.medication.create(scheduled);
	await expect(
		staff.medication.update({ id: created.id, scheduledTimes: [] })
	).rejects.toMatchObject({ code: 'BAD_REQUEST' });
	expect(await staff.medication.history({ medicationId: created.id })).toHaveLength(1);
	expect(
		(await staff.medication.list({ clientId: person }))
			.find((row) => row.id === created.id)
			?.scheduledTimes?.map((t) => t.slice(0, 5))
	).toEqual(['08:00', '20:00']);
	const prn = await staff.medication.update({
		id: created.id,
		scheduledTimes: [],
		prnInstructions: 'As written on label'
	});
	expect(prn.scheduledTimes).toEqual([]);
	await expect(
		staff.medication.update({ id: created.id, scheduledTimes: ['12:00'] })
	).rejects.toMatchObject({ code: 'BAD_REQUEST' });
	expect(await staff.medication.history({ medicationId: created.id })).toHaveLength(2);
	const restored = await staff.medication.update({
		id: created.id,
		scheduledTimes: ['12:00'],
		prnInstructions: null,
		dose: null,
		notes: ''
	});
	expect(restored).toMatchObject({
		scheduledTimes: ['12:00'],
		prnInstructions: null,
		dose: null,
		notes: null
	});
	expect(await staff.medication.history({ medicationId: created.id })).toHaveLength(3);
});

it('enforces roles, features, tenant visibility and active-client creation', async () => {
	const staff = await as(supervisor),
		care = await as(caregiver);
	const created = await staff.medication.create(scheduled);
	const user = (await getCurrentUser(uid(supervisor)))!;
	const noPlan = caller({ user: { ...user, features: [] }, request: {} });
	for (const denied of [care, noPlan]) {
		await expect(denied.medication.create(scheduled)).rejects.toMatchObject({ code: 'FORBIDDEN' });
		await expect(
			denied.medication.update({ id: created.id, notes: 'Denied' })
		).rejects.toMatchObject({ code: 'FORBIDDEN' });
		await expect(denied.medication.stop({ id: created.id })).rejects.toMatchObject({
			code: 'FORBIDDEN'
		});
		await expect(denied.medication.history({ medicationId: created.id })).rejects.toMatchObject({
			code: 'FORBIDDEN'
		});
	}
	for (const clientId of [inactive, foreignPerson, randomUUID()])
		await expect(staff.medication.create({ ...scheduled, clientId })).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	const foreignMedication = randomUUID();
	await withService((tx) =>
		tx
			.insert(s.medications)
			.values({
				id: foreignMedication,
				agency_id: foreignAgency,
				client_id: foreignPerson,
				name: 'Foreign order'
			})
	);
	await expect(
		staff.medication.update({ id: foreignMedication, notes: 'Denied' })
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
	await expect(staff.medication.stop({ id: foreignMedication })).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
	await expect(staff.medication.history({ medicationId: foreignMedication })).rejects.toMatchObject(
		{ code: 'NOT_FOUND' }
	);
	expect(
		(await (await as(admin)).medication.update({ id: created.id, route: 'Label route' })).route
	).toBe('Label route');
});

it('serializes stop/update and concurrent repeated stops without duplicate stop history', async () => {
	const staff = await as(supervisor),
		created = await staff.medication.create(scheduled);
	const results = await Promise.allSettled([
		staff.medication.stop({ id: created.id }),
		staff.medication.update({ id: created.id, notes: 'Only before stop' }),
		staff.medication.stop({ id: created.id })
	]);
	expect(results[0].status).toBe('fulfilled');
	expect(results[2].status).toBe('fulfilled');
	await expect(
		staff.medication.update({ id: created.id, name: 'After stop' })
	).rejects.toMatchObject({ code: 'CONFLICT' });
	const history = await staff.medication.history({ medicationId: created.id });
	expect(history.filter((row) => row.action === 'stopped')).toHaveLength(1);
	expect(history[0].action).toBe('stopped');
	expect(history.filter((row) => row.action === 'updated')).toHaveLength(
		results[1].status === 'fulfilled' ? 1 : 0
	);
});

it('bounds active/all medication lists and history without silently truncating', async () => {
	const staff = await as(supervisor),
		capPerson = randomUUID();
	await withService(async (tx) => {
		await tx
			.insert(s.clients)
			.values({ id: capPerson, agency_id: agency, home_id: home, name: 'Synthetic capped person' });
		await tx
			.insert(s.medications)
			.values(
				Array.from({ length: 501 }, (_, i) => ({
					agency_id: agency,
					client_id: capPerson,
					home_id: home,
					name: `Synthetic ${i}`,
					stopped_at: i === 500 ? new Date() : null
				}))
			);
	});
	expect(await staff.medication.list({ clientId: capPerson })).toHaveLength(500);
	await expect(
		staff.medication.list({ clientId: capPerson, includeStopped: true })
	).rejects.toMatchObject({ code: 'BAD_REQUEST' });
	const created = await staff.medication.create(scheduled);
	await withService((tx) =>
		tx
			.insert(s.medicationHistory)
			.values(
				Array.from({ length: 500 }, () => ({
					agency_id: agency,
					medication_id: created.id,
					action: 'updated' as const,
					changed_by: supervisor
				}))
			)
	);
	await expect(staff.medication.history({ medicationId: created.id })).rejects.toMatchObject({
		code: 'BAD_REQUEST'
	});
});
