// Phase 2 care-record procedures (trpc-router.md: note, mar, medication,
// health, incident, attendance), through the real router as real users.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';

const { closeDb, withService, withUser } = await import('../../../src/lib/server/db');
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
		await t.insert(s.agencies).values({
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
		// A second approval would notify the author twice.
		await expect(sam.note.approve({ id: noteId })).rejects.toMatchObject({
			code: 'CONFLICT',
			message: 'This note was already approved'
		});
	});

	it('a discontinued goal takes no new trials', async () => {
		const stopped = randomUUID();
		await withService((t) =>
			t.insert(s.goals).values({
				id: stopped,
				agency_id: AGENCY,
				client_id: PERSON,
				area: 'Daily living',
				text: 'Synthetic stopped goal',
				stopped_at: new Date()
			})
		);
		await expect(
			(await as(CARA)).note.create({
				clientId: PERSON,
				type: 'shift',
				goals: [{ goalId: stopped, trials: ['Independent'] }]
			})
		).rejects.toMatchObject({ code: 'BAD_REQUEST' });
	});

	it('goal trials can’t be written onto a signed note, even straight to the table', async () => {
		const cara = await as(CARA);
		const r = await cara.note.create({ clientId: PERSON, type: 'shift', content: {} });
		await cara.note.sign({ id: r.id });
		await expect(
			cara.note.update({ id: r.id, goals: [{ goalId: GOAL, trials: ['Independent'] }] })
		).rejects.toMatchObject({ code: 'CONFLICT' });
		// The database backstop: the policy refuses the row for the author too.
		const claims = { agency_id: AGENCY, role: 'caregiver' as const, profile_id: CARA };
		await expect(
			withUser(claims, {}, (t) =>
				t.insert(s.noteGoals).values({
					agency_id: AGENCY,
					note_id: r.id,
					goal_id: GOAL,
					trials: ['Independent']
				})
			)
		).rejects.toThrow();
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

	it('two people recording the same effect at once: only the first is kept', async () => {
		const cara = await as(CARA);
		const prn = await cara.mar.record({
			clientId: PERSON,
			medicationId: PRN,
			day: TODAY,
			status: 'given',
			reason: 'Synthetic symptom'
		});
		const results = await Promise.allSettled([
			cara.mar.recordEffect({ id: prn.id, effect: 'First effect' }),
			(await as(SAM)).mar.recordEffect({ id: prn.id, effect: 'Second effect' })
		]);
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		const [row] = await withService((t) =>
			t.select().from(s.marRecords).where(eq(s.marRecords.id, prn.id))
		);
		const kept = results[0].status === 'fulfilled' ? 'First effect' : 'Second effect';
		expect(row.effect).toBe(kept);
	});

	it('keeps an offline dose recorded before its time changed, and a correction keeps its slot', async () => {
		const sam = await as(SAM);
		const med = randomUUID();
		const person = randomUUID();
		await withService(async (t) => {
			await t
				.insert(s.clients)
				.values({ id: person, agency_id: AGENCY, home_id: OAK, name: 'Retimed Person' });
			await t.insert(s.medications).values({
				id: med,
				agency_id: AGENCY,
				client_id: person,
				name: 'Synthetic retimed med',
				scheduled_times: ['08:00']
			});
		});
		const recordedAt = new Date(Date.now() - 60_000);
		await withService((t) =>
			t
				.update(s.medications)
				.set({ scheduled_times: ['09:00'], updated_at: new Date() })
				.where(eq(s.medications.id, med))
		);
		const given = { id: randomUUID() };
		const offline = await sam.sync.upload({
			transactionId: 90,
			ops: [
				{
					op: 'PUT',
					table: 'mar_records',
					id: given.id,
					data: {
						client_id: person,
						medication_id: med,
						day: TODAY,
						scheduled_time: '08:00',
						status: 'given',
						recorded_at: recordedAt.toISOString()
					}
				}
			]
		});
		expect(offline.rejected).toEqual([]);
		// A new dose for the old time is still refused.
		await expect(
			sam.mar.record({
				clientId: person,
				medicationId: med,
				day: TODAY,
				scheduledTime: '08:00',
				status: 'given'
			})
		).rejects.toMatchObject({ code: 'BAD_REQUEST' });
		const fix = await sam.mar.record({
			clientId: person,
			medicationId: med,
			day: TODAY,
			scheduledTime: '09:00',
			status: 'refused',
			reason: 'Synthetic correction',
			amendsId: given.id
		});
		const [row] = await withService((t) =>
			t.select().from(s.marRecords).where(eq(s.marRecords.id, fix.id))
		);
		expect(row).toMatchObject({ scheduled_time: '08:00:00', amends_id: given.id });
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

	it('keeps a dose given after its medication stopped, and alerts supervisors at once', async () => {
		const medicationId = randomUUID();
		const stoppedAt = new Date(Date.now() - 60 * 60_000);
		await withService((t) =>
			t.insert(s.medications).values({
				id: medicationId,
				agency_id: AGENCY,
				client_id: PERSON,
				name: 'Synthetic stopped as-needed med',
				stopped_at: stoppedAt
			})
		);
		const cara = await as(CARA);
		const alerts = (id: string) =>
			withService((t) =>
				t
					.select({ type: s.notifications.type, priority: s.notifications.priority })
					.from(s.notifications)
					.where(
						and(
							eq(s.notifications.reference_id, id),
							eq(s.notifications.channel, 'in_app'),
							eq(s.notifications.type, 'med_given_after_stop')
						)
					)
			);
		// Given before the stop, recorded offline and uploaded later: nothing to flag.
		const before = { id: randomUUID() };
		const queued = await cara.sync.upload({
			transactionId: 30,
			ops: [
				{
					op: 'PUT' as const,
					table: 'mar_records',
					id: before.id,
					data: {
						client_id: PERSON,
						medication_id: medicationId,
						day: TODAY,
						status: 'given',
						reason: 'Synthetic headache',
						recorded_at: new Date(stoppedAt.getTime() - 60_000).toISOString()
					}
				}
			]
		});
		expect(queued.rejected).toEqual([]);
		expect(await alerts(before.id)).toEqual([]);
		// Given after the stop: kept as recorded, supervisors told.
		const after = await cara.mar.record({
			clientId: PERSON,
			medicationId,
			day: TODAY,
			status: 'given',
			reason: 'Synthetic headache'
		});
		expect(after.result).toBe('recorded');
		expect(await alerts(after.id)).toContainEqual({ type: 'med_given_after_stop', priority: 1 });
		// A refusal after the stop gave nothing, so it doesn't raise this alert.
		const refused = await cara.mar.record({
			clientId: PERSON,
			medicationId,
			day: TODAY,
			status: 'refused',
			reason: 'Synthetic refusal'
		});
		expect(await alerts(refused.id)).toEqual([]);
	});

	it('requires a correction reason online and in queued writes, preserving valid append-only corrections', async () => {
		const cara = await as(CARA);
		const medicationId = randomUUID();
		await withService((tx) =>
			tx.insert(s.medications).values({
				id: medicationId,
				agency_id: AGENCY,
				client_id: PERSON,
				name: 'Synthetic scheduled medication',
				scheduled_times: ['12:00']
			})
		);
		const original = await cara.mar.record({
			clientId: PERSON,
			medicationId,
			day: TODAY,
			scheduledTime: '12:00',
			status: 'given'
		});
		for (const reason of [undefined, '', '   ']) {
			await expect(
				cara.mar.record({
					clientId: PERSON,
					medicationId,
					day: TODAY,
					scheduledTime: '12:00',
					status: 'given',
					amendsId: original.id,
					reason
				})
			).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'Explain the correction' });
		}
		const rejectedIds = [randomUUID(), randomUUID(), randomUUID()];
		const rejected = await cara.sync.upload({
			transactionId: 20,
			ops: rejectedIds.map((id, i) => ({
				op: 'PUT' as const,
				table: 'mar_records',
				id,
				data: {
					client_id: PERSON,
					medication_id: medicationId,
					day: TODAY,
					scheduled_time: '12:00',
					status: 'given',
					amends_id: original.id,
					reason: [null, '', '   '][i]
				}
			}))
		});
		expect(rejected.applied).toEqual([]);
		expect(rejected.rejected).toEqual(
			rejectedIds.map((id, index) => ({
				id,
				table: 'mar_records',
				index,
				code: 'VALIDATION_FAILED',
				message: 'Explain the correction'
			}))
		);
		const correction = await cara.mar.record({
			clientId: PERSON.toUpperCase(),
			medicationId,
			day: TODAY,
			scheduledTime: '12:00',
			status: 'held',
			amendsId: original.id,
			reason: 'Earlier status entered incorrectly'
		});
		const queuedId = randomUUID();
		const upload = {
			transactionId: 21,
			ops: [
				{
					op: 'PUT' as const,
					table: 'mar_records',
					id: queuedId,
					data: {
						client_id: PERSON,
						medication_id: medicationId,
						day: TODAY,
						scheduled_time: '12:00',
						status: 'given',
						amends_id: original.id,
						reason: 'Additional correction after checking record'
					}
				}
			]
		};
		for (let i = 0; i < 2; i++) {
			const result = await cara.sync.upload(upload);
			expect(result.applied).toEqual([queuedId]);
			expect(result.rejected).toEqual([]);
		}
		const records = (await cara.mar.list({ clientId: PERSON })).filter(
			(row) => row.medicationId === medicationId
		);
		expect(records).toHaveLength(3);
		expect(records.find((row) => row.id === original.id)).toMatchObject({
			status: 'given',
			reason: null,
			amendsId: null
		});
		expect(records.find((row) => row.id === correction.id)).toMatchObject({
			status: 'held',
			amendsId: original.id,
			reason: 'Earlier status entered incorrectly'
		});
		expect(records.find((row) => row.id === queuedId)).toMatchObject({
			status: 'given',
			amendsId: original.id,
			reason: 'Additional correction after checking record'
		});
	});

	it('rejects another person’s amendment target even when visible, and hides targets outside the caller’s homes', async () => {
		const sam = await as(SAM);
		const medicationId = randomUUID();
		await withService((tx) =>
			tx.insert(s.medications).values({
				id: medicationId,
				agency_id: AGENCY,
				client_id: MAPLE_PERSON,
				name: 'Synthetic as-needed medication'
			})
		);
		const original = await sam.mar.record({
			clientId: MAPLE_PERSON,
			medicationId,
			day: TODAY,
			status: 'given',
			reason: 'Observed symptom'
		});
		for (const [caller, code, message] of [
			[sam, 'BAD_REQUEST', 'A correction must refer to this person’s record of this medication'],
			[await as(CARA), 'NOT_FOUND', 'The record being corrected was not found']
		] as const) {
			await expect(
				caller.mar.record({
					clientId: PERSON,
					medicationId: PRN,
					day: TODAY,
					status: 'given',
					reason: 'Correction',
					amendsId: original.id
				})
			).rejects.toMatchObject({ code, message });
			const id = randomUUID();
			const result = await caller.sync.upload({
				transactionId: 22,
				ops: [
					{
						op: 'PUT',
						table: 'mar_records',
						id,
						data: {
							client_id: PERSON,
							medication_id: PRN,
							day: TODAY,
							status: 'given',
							reason: 'Correction',
							amends_id: original.id
						}
					}
				]
			});
			expect(result.applied).toEqual([]);
			expect(result.rejected).toEqual([
				{
					id,
					table: 'mar_records',
					index: 0,
					code: code === 'BAD_REQUEST' ? 'VALIDATION_FAILED' : 'NOT_FOUND',
					message
				}
			]);
			expect((await caller.mar.list({ clientId: PERSON })).some((row) => row.id === id)).toBe(
				false
			);
		}
	});
});

describe('health.*', () => {
	it('keeps the caregiver health form answers through upload and subsequent reads', async () => {
		const cara = await as(CARA);
		const entries = [
			{
				kind: 'seizure' as const,
				data: {
					started: '14:05',
					observed: 'Observed movement',
					actions: 'Followed protocol',
					postIctal: 'Rested'
				}
			},
			{
				kind: 'illness' as const,
				data: { symptoms: 'Cough', contagious: 'Not sure', actions: 'Told supervisor' }
			},
			{
				kind: 'appointment' as const,
				data: { date: TODAY, provider: 'Test provider', outcome: 'Follow-up planned' }
			}
		];
		for (const entry of entries) {
			const id = randomUUID();
			const result = await cara.sync.upload({
				transactionId: 2,
				ops: [
					{
						op: 'PUT',
						table: 'health_entries',
						id,
						data: { client_id: PERSON, kind: entry.kind, data: JSON.stringify(entry.data) }
					}
				]
			});
			expect(result.rejected).toEqual([]);
			expect(
				(await cara.health.list({ clientId: PERSON })).find((row) => row.id === id)?.data
			).toEqual(entry.data);
		}
	});
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
	it('uses the person’s own vital limits when a supervisor sets them', async () => {
		const sam = await as(SAM);
		const cara = await as(CARA);
		await expect(
			cara.client.updateHealth({ clientId: PERSON, vitalLimits: { sysHi: 120 } })
		).rejects.toMatchObject({ code: 'FORBIDDEN' });
		await expect(
			sam.client.updateHealth({ clientId: PERSON, vitalLimits: { sysLo: 130, sysHi: 120 } })
		).rejects.toMatchObject({ code: 'BAD_REQUEST' });
		// One end alone is checked against the default for the other (systolic high 140).
		await expect(
			sam.client.updateHealth({ clientId: PERSON, vitalLimits: { sysLo: 145 } })
		).rejects.toMatchObject({ code: 'BAD_REQUEST' });
		await sam.client.updateHealth({ clientId: PERSON, vitalLimits: { sysLo: 80, sysHi: 120 } });
		try {
			const reading = { temp: 98.6, pulse: 70, systolic: 125, diastolic: 80 };
			expect(
				(await cara.health.create({ clientId: PERSON, kind: 'vitals', data: reading })).flags
			).toEqual(['blood_pressure']);
			expect((await sam.client.get({ id: PERSON })).healthInfo?.vitalLimits).toEqual({
				sysLo: 80,
				sysHi: 120
			});
		} finally {
			await sam.client.updateHealth({ clientId: PERSON, vitalLimits: null });
		}
		// Back on the defaults, 125 is normal again.
		expect(
			(
				await cara.health.create({
					clientId: PERSON,
					kind: 'vitals',
					data: { systolic: 125, diastolic: 80 }
				})
			).flags
		).toEqual([]);
	});
});

describe('incident.*', () => {
	it('sends the urgent alert for a critical incident even at low severity, and keeps it off the board', async () => {
		const r = await (
			await as(CARA)
		).incident.create({
			clientId: PERSON,
			type: 'Suspected abuse or neglect',
			severity: 'Low',
			occurredAt: new Date(Date.now() - 60_000),
			description: 'Synthetic concern reported by a visitor'
		});
		const [alert] = await withService((t) =>
			t
				.select()
				.from(s.notifications)
				.where(and(eq(s.notifications.reference_id, r.id), eq(s.notifications.channel, 'in_app')))
		);
		expect(alert).toMatchObject({
			type: 'incident_high_severity',
			priority: 1,
			title: 'Urgent incident reported'
		});
		const board = await withService((t) =>
			t.select().from(s.messages).where(eq(s.messages.incident_id, r.id))
		);
		expect(board).toEqual([]);
	});
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
		// Lomi tells the home's board, without the person's name (frontend-spec-2.md §3.6).
		const board = await withService((t) =>
			t
				.select({
					body: s.messages.body,
					createdBy: s.messages.created_by,
					incidentId: s.messages.incident_id
				})
				.from(s.messages)
				.where(and(eq(s.messages.home_id, OAK), eq(s.messages.from_name, 'Lomi')))
		);
		expect(board).toContainEqual({
			body: 'Cara reported an incident (fall, high severity). A supervisor will follow up.',
			createdBy: null,
			incidentId: r.id
		});

		const sam = await as(SAM);
		await sam.incident.markNotified({ id: r.id, party: 'guardian' });
		const twice = await sam.incident.markNotified({ id: r.id, party: 'guardian' });
		expect(twice.notifiedParties).toEqual(['guardian']);
		const reviewed = await sam.incident.review({ id: r.id, followupNotes: 'Checked the rug' });
		expect(reviewed.status).toBe('reviewed');
		// Reviewing ends the alert, so its escalation texts stop.
		const unread = await withService((tx) =>
			tx
				.select({ readAt: s.notifications.read_at })
				.from(s.notifications)
				.where(and(eq(s.notifications.reference_id, r.id), eq(s.notifications.channel, 'in_app')))
		);
		expect(unread.length).toBeGreaterThan(0);
		expect(unread.every((n) => n.readAt)).toBe(true);
		// The first review time is kept when the notes are edited again.
		const firstReview = async () =>
			(
				await withService((tx) =>
					tx
						.select({ at: s.incidents.reviewed_at })
						.from(s.incidents)
						.where(eq(s.incidents.id, r.id))
				)
			)[0].at;
		const first = await firstReview();
		expect(first).toBeInstanceOf(Date);
		await sam.incident.review({ id: r.id, followupNotes: 'Checked the rug; replaced it' });
		expect((await firstReview())?.getTime()).toBe(first!.getTime());
		const list = await (await as(CARA)).incident.list({ clientId: PERSON });
		expect(list[0]).toMatchObject({ type: 'Fall', status: 'reviewed', authorName: 'Cara Giver' });
	});

	it('keeps each witness’s name and role, with a readable copy', async () => {
		const r = await (
			await as(CARA)
		).incident.create({
			clientId: PERSON,
			type: 'Fall',
			severity: 'Low',
			occurredAt: new Date(Date.now() - 60_000),
			description: 'Synthetic fall',
			witnessList: [
				{ name: 'Dev Okafor', role: 'Staff' },
				{ name: '  ', role: 'Staff' },
				{ name: 'Ann Lee', role: 'Family or visitor' }
			]
		});
		const [row] = await withService((t) =>
			t
				.select({ list: s.incidents.witness_list, text: s.incidents.witnesses })
				.from(s.incidents)
				.where(eq(s.incidents.id, r.id))
		);
		expect(row).toEqual({
			list: [
				{ name: 'Dev Okafor', role: 'Staff' },
				{ name: 'Ann Lee', role: 'Family or visitor' }
			],
			text: 'Dev Okafor (Staff); Ann Lee (Family or visitor)'
		});
	});

	it('keeps state-reporting details and requires a description of any restraint', async () => {
		const cara = await as(CARA);
		const base = {
			clientId: PERSON,
			type: 'Behavior with harm' as const,
			severity: 'Low' as const,
			occurredAt: new Date(Date.now() - 60_000),
			description: 'Upset at dinner'
		};
		await expect(
			cara.incident.create({ ...base, reportDetails: { restraint: 'Physical hold' } })
		).rejects.toMatchObject({ code: 'BAD_REQUEST' });
		const r = await cara.incident.create({
			...base,
			reportDetails: {
				restraint: 'Physical hold',
				restraintDetail: 'Two-person escort, 1 minute',
				injuryAreas: ['Left arm', 'Tail'],
				withStaff: 'Sometimes'
			}
		});
		const [row] = await withService((t) =>
			t.select({ d: s.incidents.report_details }).from(s.incidents).where(eq(s.incidents.id, r.id))
		);
		expect(row.d).toEqual({
			restraint: 'Physical hold',
			restraintDetail: 'Two-person escort, 1 minute',
			injuryAreas: ['Left arm']
		});
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
						notified_parties: '[]',
						report_details: '{"withStaff":"Alone","bogus":1}'
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
		const [filed] = await withService((t) =>
			t
				.select({ d: s.incidents.report_details })
				.from(s.incidents)
				.where(eq(s.incidents.id, incident))
		);
		expect(filed.d).toEqual({ withStaff: 'Alone' });
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
