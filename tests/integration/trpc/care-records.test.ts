// Phase 2 care-record procedures (trpc-router.md: note, mar, medication,
// health, incident, attendance), through the real router as real users.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';

const { closeDb, withService } = await import('../../../src/lib/server/db');
const s = await import('../../../src/lib/server/db/schema');
const { getCurrentUser } = await import('../../../src/lib/server/services/auth');
const { appRouter } = await import('../../../src/lib/server/trpc/router');
const mw = await import('../../../src/lib/server/trpc/middleware');
const { ServiceError } = await import('../../../src/lib/server/errors');
const { localTime } = await import('../../../src/lib/domain');

const createCaller = mw.createCallerFactory(appRouter);
const TODAY = localTime(new Date(), 'America/New_York').day;

const AGENCY = randomUUID();
const OAK = randomUUID();
const MAPLE = randomUUID();
const PERSON = randomUUID();
const MAPLE_PERSON = randomUUID();
const GOAL = randomUUID();
const OTHER_GOAL = randomUUID();
const SCHEDULED = randomUUID();
const PRN = randomUUID();
const [CARA, DEV, SAM] = [randomUUID(), randomUUID(), randomUUID()];
const uid = (id: string) => `care-${id}`;

const as = async (profileId: string) =>
	createCaller({ user: await getCurrentUser(uid(profileId)), request: {} });

beforeAll(async () => {
	await withService(async (t) => {
		await t
			.insert(s.agencies)
			.values({
				id: AGENCY,
				name: 'Care Test Agency',
				subscription_tier: 'complete',
				slug: `care-${AGENCY}`
			});
		await t.insert(s.homes).values([
			{ id: OAK, agency_id: AGENCY, name: 'Oak', lat: 40, lng: -75, radius: 150 },
			{ id: MAPLE, agency_id: AGENCY, name: 'Maple', lat: 41, lng: -75, radius: 150 }
		]);
		const staff = (
			id: string,
			name: string,
			role: 'caregiver' | 'supervisor',
			homes: string[]
		) => ({
			id,
			agency_id: AGENCY,
			auth_uid: uid(id),
			email: `${uid(id)}@example.test`,
			name,
			role,
			home_ids: homes,
			med_certified: true
		});
		await t
			.insert(s.profiles)
			.values([
				staff(CARA, 'Cara Giver', 'caregiver', [OAK]),
				staff(DEV, 'Dev Okafor', 'caregiver', [OAK]),
				staff(SAM, 'Sam Supervisor', 'supervisor', [OAK, MAPLE])
			]);
		await t.insert(s.clients).values([
			{ id: PERSON, agency_id: AGENCY, home_id: OAK, name: 'Person Oak' },
			{ id: MAPLE_PERSON, agency_id: AGENCY, home_id: MAPLE, name: 'Person Maple' }
		]);
		await t.insert(s.goals).values([
			{
				id: GOAL,
				agency_id: AGENCY,
				client_id: PERSON,
				area: 'Daily living',
				text: 'Set the table'
			},
			{
				id: OTHER_GOAL,
				agency_id: AGENCY,
				client_id: MAPLE_PERSON,
				area: 'Daily living',
				text: 'Make the bed'
			}
		]);
		await t.insert(s.medications).values([
			{
				id: SCHEDULED,
				agency_id: AGENCY,
				client_id: PERSON,
				name: 'Med A',
				dose: '10 mg',
				route: 'oral',
				scheduled_times: ['08:00']
			},
			{ id: PRN, agency_id: AGENCY, client_id: PERSON, name: 'Med PRN' }
		]);
	});
});

afterAll(closeDb);

describe('Lomi access and labels', () => {
	it('uses source text when cloud drafting is unconfigured and refuses another home', async () => {
		vi.stubEnv('LOMI_MODEL', '');
		try {
			const cara = await as(CARA);
			const result = await cara.lomi.draft({
				clientId: PERSON,
				type: 'shift',
				prompt: 'Ate lunch. Was fine.'
			});
			expect(result.fallback).toBe(true);
			expect(result.content.meals).toBe('Ate lunch.');
			expect(result.flags.map((f) => f.phrase)).toContain('was fine');
			await expect(
				cara.lomi.draft({ clientId: MAPLE_PERSON, type: 'shift', prompt: 'Test only.' })
			).rejects.toMatchObject({ code: 'NOT_FOUND' });
		} finally {
			vi.unstubAllEnvs();
		}
	});
	it('returns section edits and follow-ups as proposals without touching any note', async () => {
		vi.stubEnv('LOMI_MODEL', '');
		try {
			const cara = await as(CARA);
			expect(
				await cara.lomi.edit({
					clientId: PERSON,
					section: 'meals',
					current: 'Ate breakfast.',
					input: 'Drank water at lunch.'
				})
			).toEqual({ text: 'Ate breakfast. Drank water at lunch.', fallback: true });
			const routed = await cara.lomi.route({
				clientId: PERSON,
				message: 'Ate lunch. Smiled at staff.',
				current: { activities: 'Walked.', meals: 'Ate breakfast.', mood: '', health: '' }
			});
			expect(routed).toEqual({
				updates: [
					{ section: 'meals', text: 'Ate breakfast. Ate lunch.' },
					{ section: 'mood', text: 'Smiled at staff.' }
				],
				fallback: true
			});
			await expect(
				cara.lomi.edit({ clientId: MAPLE_PERSON, section: 'meals', current: '', input: 'Test.' })
			).rejects.toMatchObject({ code: 'NOT_FOUND' });
			await expect(
				cara.lomi.route({
					clientId: MAPLE_PERSON,
					message: 'Test.',
					current: { activities: '', meals: '', mood: '', health: '' }
				})
			).rejects.toMatchObject({ code: 'NOT_FOUND' });
		} finally {
			vi.unstubAllEnvs();
		}
	});
	it('rejects unknown sections and oversized assisted edits', async () => {
		const cara = await as(CARA);
		await expect(
			cara.lomi.edit({
				clientId: PERSON,
				// @ts-expect-error goal scores are never an editable Lomi section
				section: 'goal_scores',
				current: '',
				input: 'Independent'
			})
		).rejects.toMatchObject({ code: 'BAD_REQUEST' });
		await expect(
			cara.lomi.edit({ clientId: PERSON, section: 'meals', current: 'x'.repeat(6001), input: 'y' })
		).rejects.toMatchObject({ code: 'BAD_REQUEST' });
		const long = 'x'.repeat(2500);
		await expect(
			cara.lomi.route({
				clientId: PERSON,
				message: 'Ate lunch.',
				current: { activities: long, meals: long, mood: long, health: long }
			})
		).rejects.toMatchObject({ code: 'BAD_REQUEST' });
	});
	it('keeps the Lomi label after a manual draft is edited with Lomi online or offline', async () => {
		const cara = await as(CARA);
		const note = await cara.note.create({ clientId: PERSON, type: 'shift' });
		await cara.note.update({
			id: note.id,
			content: { activities: 'Synthetic observation' },
			lomiDrafted: true
		});
		expect((await cara.note.get({ id: note.id })).lomiDrafted).toBe(true);
		await cara.sync.upload({
			transactionId: 20,
			ops: [
				{
					op: 'PATCH',
					table: 'notes',
					id: note.id,
					data: { content: '{"activities":"Edited observation"}', lomi_drafted: 0 }
				}
			]
		});
		expect((await cara.note.get({ id: note.id })).lomiDrafted).toBe(true);
	});
});

describe('transactions', () => {
	it('a procedure that fails after writing leaves nothing behind', async () => {
		const id = randomUUID();
		const { sendMessage } = await import('../../../src/lib/server/services/message');
		const failing = mw.router({
			writeThenFail: mw.userProcedure.mutation(async ({ ctx }) => {
				await sendMessage(ctx.db, ctx.user.agencyId, ctx.user, {
					id,
					homeId: OAK,
					body: 'should roll back'
				});
				throw new ServiceError('RULE_VIOLATION', 'fails after the write');
			})
		});
		const caller = mw.createCallerFactory(failing)({
			user: await getCurrentUser(uid(CARA)),
			request: {}
		});
		await expect(caller.writeThenFail()).rejects.toMatchObject({
			code: 'CONFLICT',
			message: 'fails after the write'
		});
		const rows = await withService((t) => t.select().from(s.messages).where(eq(s.messages.id, id)));
		expect(rows).toEqual([]);
	});
});

describe('note.*', () => {
	let noteId: string;

	it('creates a note with goal trials, defaulting day and shift to the current shift', async () => {
		const cara = await as(CARA);
		const r = await cara.note.create({
			clientId: PERSON,
			type: 'shift',
			content: { activities: 'Walk' },
			goals: [{ goalId: GOAL, trials: ['Independent', 'Verbal prompt'] }]
		});
		noteId = r.id;
		expect(r.status).toBe('draft');
		const note = await cara.note.get({ id: noteId });
		expect(note.goals).toEqual([
			expect.objectContaining({
				goalId: GOAL,
				goalText: 'Set the table',
				trials: ['Independent', 'Verbal prompt']
			})
		]);
		expect(note.history.map((h) => h.action)).toEqual(['created']);
		expect(['am', 'pm', 'on']).toContain(note.shift);
	});

	it('rejects unknown prompt levels and goals belonging to someone else', async () => {
		const cara = await as(CARA);
		await expect(
			cara.note.create({
				clientId: PERSON,
				type: 'shift',
				goals: [{ goalId: GOAL, trials: ['Did great'] }]
			})
		).rejects.toMatchObject({ code: 'BAD_REQUEST' });
		await expect(
			cara.note.create({
				clientId: PERSON,
				type: 'shift',
				goals: [{ goalId: OTHER_GOAL, trials: ['Independent'] }]
			})
		).rejects.toMatchObject({
			code: 'BAD_REQUEST',
			message: 'That goal is not one of this person’s goals'
		});
	});

	it('the author updates goals and signs; history follows', async () => {
		const cara = await as(CARA);
		await cara.note.update({
			id: noteId,
			goals: [{ goalId: GOAL, trials: [], notAttempted: true, reason: 'Out at program' }]
		});
		await cara.note.sign({ id: noteId });
		const note = await cara.note.get({ id: noteId });
		expect(note.status).toBe('submitted');
		expect(note.goals[0]).toMatchObject({
			notAttempted: true,
			reason: 'Out at program',
			trials: []
		});
		expect(note.history.map((h) => h.action)).toEqual(['created', 'signed']);
	});

	it('only supervisors review; send-back needs a comment; then the author can resubmit', async () => {
		await expect((await as(DEV)).note.approve({ id: noteId })).rejects.toMatchObject({
			code: 'FORBIDDEN'
		});
		const sam = await as(SAM);
		await expect(sam.note.sendBack({ id: noteId, comment: ' ' })).rejects.toMatchObject({
			code: 'BAD_REQUEST'
		});
		const back = await sam.note.sendBack({ id: noteId, comment: 'Add lunch' });
		expect(back).toMatchObject({ status: 'returned', supervisorComment: 'Add lunch' });
		const cara = await as(CARA);
		await cara.note.update({ id: noteId, content: { activities: 'Walk', meals: 'Lunch' } });
		await cara.note.sign({ id: noteId });
		await sam.note.approve({ id: noteId });
		const note = await cara.note.get({ id: noteId });
		expect(note.status).toBe('approved');
		expect(note.history.map((h) => h.action)).toEqual([
			'created',
			'signed',
			'returned',
			'edited',
			'amended and resubmitted',
			'approved'
		]);
		await expect(cara.note.update({ id: noteId, content: {} })).rejects.toMatchObject({
			code: 'CONFLICT',
			message: 'This note was already approved'
		});
	});

	it('lists are scoped to the caller’s homes', async () => {
		await (await as(SAM)).note.create({ clientId: MAPLE_PERSON, type: 'shift', content: {} });
		const caraList = await (await as(CARA)).note.list({});
		expect(caraList.every((n) => n.clientId === PERSON)).toBe(true);
		const samList = await (await as(SAM)).note.list({ clientId: MAPLE_PERSON });
		expect(samList).toHaveLength(1);
		expect(samList[0].clientName).toBe('Person Maple');
	});
});

describe('mar.* and medication.list', () => {
	it('records, lists with medication details, and lets supervisors acknowledge', async () => {
		const cara = await as(CARA);
		const r = await cara.mar.record({
			clientId: PERSON,
			medicationId: SCHEDULED,
			day: TODAY,
			scheduledTime: '08:00',
			status: 'refused',
			reason: 'Asleep'
		});
		expect(r.result).toBe('recorded');
		const today = await cara.mar.list({ clientId: PERSON });
		expect(today[0]).toMatchObject({
			medicationName: 'Med A',
			dose: '10 mg',
			status: 'refused',
			recordedByName: 'Cara Giver'
		});
		await expect(cara.mar.acknowledge({ id: r.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
		await (await as(SAM)).mar.acknowledge({ id: r.id });
		expect((await cara.mar.list({ clientId: PERSON }))[0].acknowledged).toBe(true);
	});

	it('records the effect of an as-needed dose once, and only for as-needed doses', async () => {
		const cara = await as(CARA);
		const prn = await cara.mar.record({
			clientId: PERSON,
			medicationId: PRN,
			day: TODAY,
			status: 'given',
			reason: 'Headache'
		});
		await cara.mar.recordEffect({ id: prn.id, effect: 'Headache eased within the hour' });
		await expect(cara.mar.recordEffect({ id: prn.id, effect: 'again' })).rejects.toMatchObject({
			code: 'CONFLICT',
			message: 'The effect was already recorded'
		});
		const scheduled = (await cara.mar.list({ clientId: PERSON })).find((m) => !m.isPrn)!;
		await expect(cara.mar.recordEffect({ id: scheduled.id, effect: 'x' })).rejects.toMatchObject({
			code: 'CONFLICT'
		});
	});

	it('medication.list hides stopped medications unless asked', async () => {
		await withService((t) =>
			t.insert(s.medications).values({
				agency_id: AGENCY,
				client_id: PERSON,
				name: 'Old med',
				stopped_at: new Date('2026-01-01')
			})
		);
		const cara = await as(CARA);
		expect((await cara.medication.list({ clientId: PERSON })).map((m) => m.name)).toEqual([
			'Med A',
			'Med PRN'
		]);
		expect(await cara.medication.list({ clientId: PERSON, includeStopped: true })).toHaveLength(3);
	});
});

describe('health.*', () => {
	it('flags out-of-range vitals, alerts supervisors, and lists flagged entries first', async () => {
		const cara = await as(CARA);
		await cara.health.create({ clientId: PERSON, kind: 'vitals', data: { temp: 98.6, pulse: 70 } });
		const high = await cara.health.create({
			clientId: PERSON,
			kind: 'vitals',
			data: { temp: 101.2, pulse: 110, systolic: 120, diastolic: 80 }
		});
		expect(high.flags).toEqual(['temperature', 'pulse']);
		const alerts = await withService((t) =>
			t
				.select()
				.from(s.notifications)
				.where(
					and(
						eq(s.notifications.reference_id, high.id),
						eq(s.notifications.type, 'health_alert'),
						eq(s.notifications.channel, 'in_app')
					)
				)
		);
		expect(alerts.map((a) => a.profile_id)).toEqual([SAM]);
		const list = await cara.health.list({ clientId: PERSON });
		expect(list[0].id).toBe(high.id);
		expect(list[0].recordedByName).toBe('Cara Giver');
		await (await as(SAM)).health.acknowledge({ id: high.id });
	});

	it('validates the data shape for each kind', async () => {
		await expect(
			(await as(CARA)).health.create({ clientId: PERSON, kind: 'vitals', data: { temp: 'hot' } })
		).rejects.toMatchObject({ code: 'BAD_REQUEST' });
	});
});

describe('incident.*', () => {
	it('files a report, notifies supervisors (urgent if high), and returns who must be told', async () => {
		const r = await (
			await as(CARA)
		).incident.create({
			clientId: PERSON,
			type: 'Fall',
			severity: 'High',
			occurredAt: new Date(Date.now() - 60_000),
			description: 'Slipped in the hallway'
		});
		expect(r.mustNotify.map((n) => n.who)).toEqual([
			'Supervisor',
			'Family or guardian',
			'Nurse',
			'State reporting system'
		]);
		const [alert] = await withService((t) =>
			t
				.select()
				.from(s.notifications)
				.where(and(eq(s.notifications.reference_id, r.id), eq(s.notifications.channel, 'in_app')))
		);
		expect(alert).toMatchObject({
			type: 'incident_high_severity',
			priority: 1,
			title: 'High-severity incident reported'
		});

		const sam = await as(SAM);
		await sam.incident.markNotified({ id: r.id, party: 'guardian' });
		const twice = await sam.incident.markNotified({ id: r.id, party: 'guardian' });
		expect(twice.notifiedParties).toEqual(['guardian']);
		const reviewed = await sam.incident.review({ id: r.id, followupNotes: 'Checked the rug' });
		expect(reviewed.status).toBe('reviewed');
		const list = await (await as(CARA)).incident.list({ clientId: PERSON });
		expect(list[0]).toMatchObject({ type: 'Fall', status: 'reviewed', authorName: 'Cara Giver' });
	});
});

describe('attendance.*', () => {
	it('merges services from two caregivers into one record, never replacing', async () => {
		await (
			await as(CARA)
		).attendance.save({ clientId: PERSON, day: TODAY, services: ['In-home support'] });
		const merged = await (
			await as(DEV)
		).attendance.save({
			clientId: PERSON,
			day: TODAY,
			services: ['Day program', 'In-home support']
		});
		expect(merged.services).toEqual(['Day program', 'In-home support']);
		const list = await (await as(CARA)).attendance.list({ clientId: PERSON });
		expect(list).toHaveLength(1);
		const audit = await withService((t) =>
			t
				.select({ by: s.auditLog.performed_by })
				.from(s.auditLog)
				.where(and(eq(s.auditLog.table_name, 'attendance'), eq(s.auditLog.record_id, merged.id)))
		);
		expect(audit.map((a) => a.by).sort()).toEqual([CARA, DEV].sort());
	});

	it('rejects services not on the list and people outside the caller’s homes', async () => {
		const cara = await as(CARA);
		await expect(
			cara.attendance.save({ clientId: PERSON, day: TODAY, services: ['Spa day' as 'Day program'] })
		).rejects.toMatchObject({ code: 'BAD_REQUEST' });
		await expect(
			cara.attendance.save({ clientId: MAPLE_PERSON, day: TODAY, services: ['Day program'] })
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
});

describe('sync.upload for the new tables', () => {
	it('health entries, incidents, goal trials and attendance edits upload through the same services', async () => {
		const cara = await as(CARA);
		const note = await cara.note.create({ clientId: PERSON, type: 'shift', content: {} });
		const [health, incident] = [randomUUID(), randomUUID()];
		const existing = (await cara.attendance.list({ clientId: PERSON }))[0];
		const r = await cara.sync.upload({
			transactionId: 1,
			ops: [
				{
					op: 'PUT',
					table: 'health_entries',
					id: health,
					data: { client_id: PERSON, kind: 'vitals', data: '{"temp":94.1}' }
				},
				{
					op: 'PUT',
					table: 'incidents',
					id: incident,
					data: {
						client_id: PERSON,
						type: 'Other',
						severity: 'Low',
						occurred_at: new Date().toISOString(),
						description: 'Lost a shoe',
						notified_parties: '[]'
					}
				},
				{
					op: 'PUT',
					table: 'note_goals',
					id: randomUUID(),
					data: { note_id: note.id, goal_id: GOAL, trials: '["Model"]', not_attempted: 0 }
				},
				{
					op: 'PATCH',
					table: 'attendance',
					id: existing.id,
					data: { services: '["Community outing"]' }
				}
			]
		});
		expect(r.rejected).toEqual([]);
		expect(r.applied).toHaveLength(4);
		expect((await cara.note.get({ id: note.id })).goals[0].trials).toEqual(['Model']);
		expect(
			(await cara.health.list({ clientId: PERSON })).find((h) => h.id === health)?.flags
		).toEqual(['temperature']);
		expect((await cara.attendance.list({ clientId: PERSON }))[0].services).toEqual([
			'Community outing',
			'Day program',
			'In-home support'
		]);
	});
});
