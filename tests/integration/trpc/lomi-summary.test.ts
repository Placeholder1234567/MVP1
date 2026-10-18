// Lomi daily summary (trpc-router.md `lomi.summarize`): gated by lomi_summary,
// supervisors only, their homes only. Without a model configured, the
// briefing is written from the day's counts.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
delete process.env.LOMI_MODEL;

const { closeDb, withService } = await import('../../../src/lib/server/db');
const s = await import('../../../src/lib/server/db/schema');
const { getCurrentUser } = await import('../../../src/lib/server/services/auth');
const { appRouter } = await import('../../../src/lib/server/trpc/router');
const mw = await import('../../../src/lib/server/trpc/middleware');
const { localTime } = await import('../../../src/lib/domain');

const createCaller = mw.createCallerFactory(appRouter);
const AGENCY = randomUUID(),
	STARTER = randomUUID(),
	HOME = randomUUID(),
	OTHER_HOME = randomUUID();
const [ANA, BEN] = [randomUUID(), randomUUID()];
const [MED_A, MED_B] = [randomUUID(), randomUUID()];
const [SUP, CARER, ELM_SUP, STARTER_SUP] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const uid = (id: string) => `lomisum-${id}`;
const as = async (id: string) => createCaller({ user: await getCurrentUser(uid(id)), request: {} });
const TODAY = localTime(new Date(), 'UTC').day;

beforeAll(async () => {
	await withService(async (t) => {
		await t.insert(s.agencies).values([
			{
				id: AGENCY,
				name: 'Summary Test',
				slug: `ls-${AGENCY}`,
				subscription_tier: 'professional',
				timezone: 'UTC'
			},
			{ id: STARTER, name: 'Summary Starter', slug: `ls-${STARTER}`, subscription_tier: 'starter' }
		]);
		await t.insert(s.homes).values([
			{ id: HOME, agency_id: AGENCY, name: 'Oak House' },
			{ id: OTHER_HOME, agency_id: AGENCY, name: 'Elm House' }
		]);
		await t.insert(s.profiles).values(
			(
				[
					[SUP, AGENCY, 'supervisor', [HOME]],
					[CARER, AGENCY, 'caregiver', [HOME]],
					[ELM_SUP, AGENCY, 'supervisor', [OTHER_HOME]],
					[STARTER_SUP, STARTER, 'supervisor', []]
				] as const
			).map(([id, agency, role, homes]) => ({
				id,
				agency_id: agency,
				auth_uid: uid(id),
				email: `${id}@example.test`,
				name: 'Synthetic Staff',
				role,
				home_ids: [...homes]
			}))
		);
		await t.insert(s.clients).values([
			{ id: ANA, agency_id: AGENCY, home_id: HOME, name: 'Ana Synthetic', first_name: 'Ana' },
			{ id: BEN, agency_id: AGENCY, home_id: HOME, name: 'Ben Synthetic', first_name: 'Ben' }
		]);
		await t.insert(s.medications).values([
			// Midnight doses: always due by the time the test runs.
			{
				id: MED_A,
				agency_id: AGENCY,
				client_id: BEN,
				home_id: HOME,
				name: 'Synthetic A',
				scheduled_times: ['00:00']
			},
			{
				id: MED_B,
				agency_id: AGENCY,
				client_id: BEN,
				home_id: HOME,
				name: 'Synthetic B',
				scheduled_times: ['00:00']
			}
		]);
		await t.insert(s.marRecords).values({
			agency_id: AGENCY,
			client_id: BEN,
			home_id: HOME,
			medication_id: MED_A,
			day: TODAY,
			scheduled_time: '00:00',
			status: 'refused',
			reason: 'Synthetic',
			recorded_by: CARER
		});
		await t.insert(s.notes).values({
			agency_id: AGENCY,
			client_id: ANA,
			home_id: HOME,
			author_id: CARER,
			day: TODAY,
			shift: 'am',
			type: 'shift',
			content: { activities: 'Synthetic' },
			status: 'submitted'
		});
		await t.insert(s.incidents).values({
			agency_id: AGENCY,
			client_id: BEN,
			home_id: HOME,
			type: 'Fall',
			severity: 'Low',
			occurred_at: new Date(),
			description: 'Synthetic'
		});
		await t.insert(s.healthEntries).values({
			agency_id: AGENCY,
			client_id: ANA,
			home_id: HOME,
			kind: 'vitals',
			data: { temp: 101 },
			flags: ['Temperature above 100.4'],
			recorded_by: CARER
		});
		await t
			.insert(s.scheduleSlots)
			.values({ agency_id: AGENCY, home_id: HOME, day: TODAY, shift: 'pm', status: 'open' });
	});
});

afterAll(() => closeDb());

it('briefs the supervisor from the day’s records', async () => {
	const out = await (await as(SUP)).lomi.summarize({ homeId: HOME });
	expect(out.fallback).toBe(true);
	expect(out.highlights).toEqual([]);
	expect(out.snapshot).toMatchObject({
		day: TODAY,
		home: 'Oak House',
		openShifts: ['pm'],
		missingNotes: ['Ben'],
		notesToReview: 1,
		incidents: [{ person: 'Ben', type: 'Fall', severity: 'Low' }],
		meds: [{ person: 'Ben', status: 'refused' }],
		dosesNotRecorded: 1,
		healthAlerts: [{ person: 'Ana', alert: 'Temperature above 100.4' }]
	});
	expect(out.summary).toBe(
		'1 incident open. 1 health alert to follow up. 1 dose refused or held. 1 scheduled dose not recorded yet. 1 shift still open. Notes still missing for Ben. 1 note waiting for review.'
	);
});

it('is for supervisors of the home, on plans with the summary', async () => {
	await expect((await as(CARER)).lomi.summarize({ homeId: HOME })).rejects.toMatchObject({
		code: 'FORBIDDEN'
	});
	await expect((await as(ELM_SUP)).lomi.summarize({ homeId: HOME })).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
	await expect((await as(STARTER_SUP)).lomi.summarize({ homeId: HOME })).rejects.toMatchObject({
		code: 'FORBIDDEN'
	});
	await expect(
		(await as(SUP)).lomi.summarize({ homeId: HOME, day: '2999-01-01' })
	).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
