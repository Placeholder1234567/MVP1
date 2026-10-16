import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, withService } from '../../../src/lib/server/db';
import * as s from '../../../src/lib/server/db/schema';
import { getCurrentUser } from '../../../src/lib/server/services/auth';
import { createCallerFactory, router } from '../../../src/lib/server/trpc/middleware';
import { goalRouter } from '../../../src/lib/server/trpc/routers/goal';
import { reportRouter } from '../../../src/lib/server/trpc/routers/report';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
// Standalone composition deliberately avoids editing the shared root router.
const caller = createCallerFactory(router({ goal: goalRouter, report: reportRouter }));
const agency = randomUUID(),
	foreignAgency = randomUUID(),
	home = randomUUID(),
	otherHome = randomUUID(),
	foreignHome = randomUUID();
const person = randomUUID(),
	otherPerson = randomUUID(),
	foreignPerson = randomUUID(),
	archivedPerson = randomUUID();
const supervisor = randomUUID(),
	caregiver = randomUUID(),
	admin = randomUUID();
const defaultTemplate = randomUUID(),
	foreignTemplate = randomUUID();
const uid = (id: string) => `goal-${id}`;
const as = async (id: string) => caller({ user: await getCurrentUser(uid(id)), request: {} });
beforeAll(async () => {
	await withService(async (tx) => {
		await tx.insert(s.agencies).values([
			{
				id: agency,
				name: 'Synthetic goal agency',
				slug: `goal-${agency}`,
				subscription_tier: 'complete'
			},
			{
				id: foreignAgency,
				name: 'Foreign goal agency',
				slug: `goal-${foreignAgency}`,
				subscription_tier: 'complete'
			}
		]);
		await tx.insert(s.homes).values([
			{ id: home, agency_id: agency, name: 'Goal home' },
			{ id: otherHome, agency_id: agency, name: 'Other home' },
			{ id: foreignHome, agency_id: foreignAgency, name: 'Foreign home' }
		]);
		await tx.insert(s.clients).values([
			{ id: person, agency_id: agency, home_id: home, name: 'Synthetic person' },
			{ id: otherPerson, agency_id: agency, home_id: otherHome, name: 'Other person' },
			{ id: foreignPerson, agency_id: foreignAgency, home_id: foreignHome, name: 'Foreign person' },
			{
				id: archivedPerson,
				agency_id: agency,
				home_id: home,
				name: 'Archived person',
				active: false
			}
		]);
		await tx.insert(s.profiles).values([
			{
				id: supervisor,
				agency_id: agency,
				auth_uid: uid(supervisor),
				email: `${supervisor}@example.test`,
				name: 'Goal supervisor',
				role: 'supervisor',
				home_ids: [home, otherHome]
			},
			{
				id: caregiver,
				agency_id: agency,
				auth_uid: uid(caregiver),
				email: `${caregiver}@example.test`,
				name: 'Goal caregiver',
				role: 'caregiver',
				home_ids: [home]
			},
			{
				id: admin,
				agency_id: agency,
				auth_uid: uid(admin),
				email: `${admin}@example.test`,
				name: 'Goal admin',
				role: 'admin',
				home_ids: [home, otherHome]
			}
		]);
		await tx.insert(s.goalTemplates).values([
			{
				id: defaultTemplate,
				agency_id: agency,
				area: 'Daily activity',
				text: 'Tenant provisioned default',
				is_default: true
			},
			{
				id: foreignTemplate,
				agency_id: foreignAgency,
				area: 'Daily activity',
				text: 'Foreign default',
				is_default: true
			}
		]);
	});
});
afterAll(closeDb);

it('creates, edits and stops goals while preserving signed source trials and export history', async () => {
	const staff = await as(supervisor);
	const created = await staff.goal.create({
		clientId: person,
		area: ' Daily activity ',
		text: ' Choose an activity ',
		steps: [' Choose ', ' Start '],
		frequency: 'daily',
		target: 'three recorded opportunities',
		startedAt: new Date('2026-01-01T00:00Z')
	});
	expect(created).toMatchObject({
		clientId: person,
		area: 'Daily activity',
		text: 'Choose an activity',
		steps: ['Choose', 'Start'],
		frequency: 'daily',
		stoppedAt: null
	});
	const changed = await staff.goal.update({
		id: created.id,
		text: 'Choose a preferred activity',
		steps: [],
		frequency: '',
		target: ''
	});
	expect(changed).toMatchObject({
		text: 'Choose a preferred activity',
		steps: [],
		frequency: null,
		target: null
	});
	const note = randomUUID(),
		trial = randomUUID();
	await withService(async (tx) => {
		await tx.insert(s.notes).values({
			id: note,
			agency_id: agency,
			client_id: person,
			home_id: home,
			day: '2026-01-01',
			shift: 'am',
			type: 'shift',
			status: 'approved'
		});
		await tx.insert(s.noteGoals).values({
			id: trial,
			agency_id: agency,
			note_id: note,
			goal_id: created.id,
			trials: ['Independent', 'Verbal prompt']
		});
	});
	const stopped = await staff.goal.stop({ id: created.id });
	expect(stopped.stoppedAt).toBeInstanceOf(Date);
	expect(await staff.goal.stop({ id: created.id })).toEqual(stopped);
	await expect(
		staff.goal.update({ id: created.id, text: 'Cannot rewrite stopped goal' })
	).rejects.toMatchObject({ code: 'CONFLICT' });
	expect((await staff.goal.list({ clientId: person })).some((g) => g.id === created.id)).toBe(
		false
	);
	expect(
		(await staff.goal.list({ clientId: person, includeStopped: true })).find(
			(g) => g.id === created.id
		)
	).toMatchObject({ text: 'Choose a preferred activity', stoppedAt: stopped.stoppedAt });
	const report = JSON.parse(
		(
			await staff.report.exportClinical({
				type: 'goals',
				homeId: home,
				clientId: person,
				fromDay: '2026-01-01',
				toDay: '2026-01-01',
				format: 'json'
			})
		).content
	);
	expect(report.rows.find((r: { id: string }) => r.id === trial).trials).toEqual([
		'Independent',
		'Verbal prompt'
	]);
	expect(
		report.goalSummary.find((g: { goalId: string }) => g.goalId === created.id).independentPercent
	).toBe(50);
	const audit = await withService((tx) =>
		tx
			.select()
			.from(s.auditLog)
			.where(
				and(
					eq(s.auditLog.agency_id, agency),
					eq(s.auditLog.table_name, 'goals'),
					eq(s.auditLog.record_id, created.id)
				)
			)
	);
	expect(audit.map((a) => a.action)).toEqual(['INSERT', 'UPDATE', 'UPDATE']);
	expect(audit.every((a) => a.performed_by === supervisor)).toBe(true);
});

it('uses home RLS for caregiver reads and blocks role, plan, tenant and inactive-client writes', async () => {
	const staff = await as(supervisor),
		care = await as(caregiver);
	const own = await staff.goal.create({ clientId: person, area: 'Choice', text: 'An active goal' });
	const other = await staff.goal.create({
		clientId: otherPerson,
		area: 'Choice',
		text: 'Other home goal'
	});
	expect((await care.goal.list({ clientId: person })).map((g) => g.id)).toContain(own.id);
	await expect(care.goal.list({ clientId: otherPerson })).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
	await expect(
		care.goal.create({ clientId: person, area: 'Choice', text: 'Denied' })
	).rejects.toMatchObject({ code: 'FORBIDDEN' });
	await expect(care.goal.update({ id: own.id, text: 'Denied' })).rejects.toMatchObject({
		code: 'FORBIDDEN'
	});
	await expect(care.goal.stop({ id: own.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
	for (const clientId of [foreignPerson, archivedPerson])
		await expect(
			staff.goal.create({ clientId, area: 'Choice', text: 'Denied' })
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	const foreignGoal = randomUUID();
	await withService((tx) =>
		tx.insert(s.goals).values({
			id: foreignGoal,
			agency_id: foreignAgency,
			client_id: foreignPerson,
			area: 'Choice',
			text: 'Foreign goal'
		})
	);
	await expect(staff.goal.update({ id: foreignGoal, text: 'Denied' })).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
	await expect(staff.goal.stop({ id: foreignGoal })).rejects.toMatchObject({ code: 'NOT_FOUND' });
	await expect(staff.goal.list({ clientId: foreignPerson })).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
	const user = (await getCurrentUser(uid(supervisor)))!;
	const noPlan = caller({ user: { ...user, features: [] }, request: {} });
	await expect(noPlan.goal.list({ clientId: person })).rejects.toMatchObject({ code: 'FORBIDDEN' });
	await expect(
		noPlan.goal.create({ clientId: person, area: 'Choice', text: 'Denied' })
	).rejects.toMatchObject({ code: 'FORBIDDEN' });
	expect(
		(await (await as(admin)).goal.update({ id: other.id, target: 'Updated target' })).target
	).toBe('Updated target');
});

it('serializes stop/update so a stopped definition cannot be changed afterwards', async () => {
	const staff = await as(supervisor);
	const created = await staff.goal.create({
		clientId: person,
		area: 'Race test',
		text: 'Original'
	});
	await Promise.allSettled([
		staff.goal.stop({ id: created.id }),
		staff.goal.update({ id: created.id, text: 'Before stop only' })
	]);
	const final = (await staff.goal.list({ clientId: person, includeStopped: true })).find(
		(g) => g.id === created.id
	)!;
	expect(final.stoppedAt).toBeInstanceOf(Date);
	await expect(staff.goal.update({ id: created.id, area: 'After stop' })).rejects.toMatchObject({
		code: 'CONFLICT'
	});
});

it('keeps templates tenant scoped, permits provisioned defaults and forces agency-created defaults false', async () => {
	const staff = await as(supervisor);
	const created = await staff.goal.createTemplate({
		area: ' Daily activity ',
		text: 'A reusable synthetic goal',
		steps: ['First step']
	});
	expect(created).toMatchObject({
		area: 'Daily activity',
		isDefault: false,
		steps: ['First step']
	});
	const list = await staff.goal.listTemplates({ area: 'Daily activity' });
	expect(list.some((t) => t.id === defaultTemplate && t.isDefault)).toBe(true);
	expect(list.some((t) => t.id === created.id)).toBe(true);
	expect(list.some((t) => t.id === foreignTemplate)).toBe(false);
	await expect((await as(caregiver)).goal.listTemplates()).rejects.toMatchObject({
		code: 'FORBIDDEN'
	});
	await expect(
		(await as(caregiver)).goal.createTemplate({ area: 'Choice', text: 'Denied' })
	).rejects.toMatchObject({ code: 'FORBIDDEN' });
	await expect(
		staff.goal.createTemplate({ area: 'Choice', text: 'Denied default', isDefault: true } as never)
	).rejects.toMatchObject({ code: 'BAD_REQUEST' });
	await expect(
		staff.goal.create({
			clientId: person,
			area: 'Choice',
			text: 'Denied tenant field',
			agencyId: foreignAgency
		} as never)
	).rejects.toMatchObject({ code: 'BAD_REQUEST' });
	await expect(staff.goal.update({ id: randomUUID() })).rejects.toMatchObject({
		code: 'BAD_REQUEST'
	});
});

it('rejects oversized goal and template lists rather than silently truncating', async () => {
	const boundedPerson = randomUUID();
	await withService(async (tx) => {
		await tx
			.insert(s.clients)
			.values({
				id: boundedPerson,
				agency_id: agency,
				home_id: home,
				name: 'Synthetic bounded-list person'
			});
		await tx
			.insert(s.goals)
			.values(
				Array.from({ length: 501 }, (_, i) => ({
					agency_id: agency,
					client_id: boundedPerson,
					area: 'Bounded list',
					text: `Synthetic goal ${i}`
				}))
			);
	});
	await withService((tx) =>
		tx.insert(s.goalTemplates).values(
			Array.from({ length: 501 }, (_, i) => ({
				agency_id: agency,
				area: 'Bounded list',
				text: `Synthetic template ${i}`
			}))
		)
	);
	await expect(
		(await as(supervisor)).goal.listTemplates({ area: 'Bounded list' })
	).rejects.toMatchObject({ code: 'BAD_REQUEST' });
	await expect((await as(supervisor)).goal.list({ clientId: boundedPerson })).rejects.toMatchObject(
		{ code: 'BAD_REQUEST' }
	);
});
