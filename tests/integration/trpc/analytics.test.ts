// Supervisor analytics (frontend-spec-3.md §4.4) over real records.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';

const { closeDb, withService } = await import('../../../src/lib/server/db');
const s = await import('../../../src/lib/server/db/schema');
const { getCurrentUser } = await import('../../../src/lib/server/services/auth');
const { appRouter } = await import('../../../src/lib/server/trpc/router');
const mw = await import('../../../src/lib/server/trpc/middleware');
const { addDays, lastWeeks, localTime } = await import('../../../src/lib/domain');

const createCaller = mw.createCallerFactory(appRouter);
const AGENCY = randomUUID(),
	PRO = randomUUID(),
	HOME = randomUUID(),
	OTHER_HOME = randomUUID(),
	PERSON = randomUUID(),
	GOAL = randomUUID(),
	MED = randomUUID();
const [SUP, CARER, PRO_SUP] = [randomUUID(), randomUUID(), randomUUID()];
const uid = (id: string) => `analytics-${id}`;
const as = async (id: string) => createCaller({ user: await getCurrentUser(uid(id)), request: {} });
const TODAY = localTime(new Date(), 'UTC').day;

beforeAll(async () => {
	await withService(async (t) => {
		await t.insert(s.agencies).values([
			{
				id: AGENCY,
				name: 'Analytics Test',
				slug: `an-${AGENCY}`,
				subscription_tier: 'complete',
				timezone: 'UTC'
			},
			{ id: PRO, name: 'Analytics Pro', slug: `an-${PRO}`, subscription_tier: 'professional' }
		]);
		await t.insert(s.homes).values([
			{ id: HOME, agency_id: AGENCY, name: 'Oak' },
			{ id: OTHER_HOME, agency_id: AGENCY, name: 'Elm' }
		]);
		await t.insert(s.profiles).values(
			(
				[
					[SUP, AGENCY, 'supervisor'],
					[CARER, AGENCY, 'caregiver'],
					[PRO_SUP, PRO, 'supervisor']
				] as const
			).map(([id, agency, role]) => ({
				id,
				agency_id: agency,
				auth_uid: uid(id),
				email: `${uid(id)}@example.test`,
				name: 'Synthetic Staff',
				role,
				home_ids: [HOME],
				med_certified: true
			}))
		);
		await t
			.insert(s.clients)
			.values({ id: PERSON, agency_id: AGENCY, home_id: HOME, name: 'Marcus Synthetic' });
		await t.insert(s.goals).values({
			id: GOAL,
			agency_id: AGENCY,
			client_id: PERSON,
			home_id: HOME,
			area: 'Daily living',
			text: 'Use a fork'
		});
		await t.insert(s.medications).values({
			id: MED,
			agency_id: AGENCY,
			client_id: PERSON,
			home_id: HOME,
			name: 'Synthetic med',
			scheduled_times: ['08:00', '20:00'],
			started_at: new Date(`${TODAY}T00:00:00Z`)
		});
		// Last full week: two shifts worked, a signed note for one of them.
		const lastWeek = lastWeeks(new Date(), 'UTC', 2)[0];
		await t.insert(s.scheduleSlots).values(
			(['am', 'pm'] as const).map((shift) => ({
				agency_id: AGENCY,
				home_id: HOME,
				day: addDays(lastWeek, 1),
				shift,
				assigned_to: CARER,
				status: 'filled' as const
			}))
		);
		await t.insert(s.notes).values({
			agency_id: AGENCY,
			client_id: PERSON,
			home_id: HOME,
			author_id: CARER,
			day: addDays(lastWeek, 1),
			shift: 'am',
			type: 'shift',
			status: 'submitted'
		});
		const now = new Date();
		await t.insert(s.coverageRequests).values([
			{
				agency_id: AGENCY,
				home_id: HOME,
				day: TODAY,
				shift: 'pm',
				status: 'filled',
				filled_at: new Date(now.getTime() + 30 * 60_000)
			},
			{ agency_id: AGENCY, home_id: HOME, day: TODAY, shift: 'on', status: 'unfilled' },
			{ agency_id: AGENCY, home_id: OTHER_HOME, day: TODAY, shift: 'am', status: 'unfilled' }
		]);
		await t.insert(s.incidents).values({
			agency_id: AGENCY,
			client_id: PERSON,
			home_id: HOME,
			type: 'Fall',
			severity: 'Low',
			occurred_at: now,
			description: 'Synthetic'
		});
	});
	// Notes and doses through the real procedures, so history and rules apply.
	const carer = await as(CARER);
	const note = await carer.note.create({
		clientId: PERSON,
		type: 'shift',
		content: { activities: 'Synthetic' },
		goals: [{ goalId: GOAL, trials: ['Independent', 'Verbal prompt', 'Independent', 'Model'] }]
	});
	await carer.note.sign({ id: note.id });
	await (await as(SUP)).note.approve({ id: note.id });
	// An unsigned draft's trials aren't the record yet: they don't count.
	await carer.note.create({
		clientId: PERSON,
		type: 'shift',
		content: {},
		goals: [{ goalId: GOAL, trials: ['Model', 'Model', 'Model', 'Model'] }]
	});
	await carer.mar.record({
		clientId: PERSON,
		medicationId: MED,
		day: TODAY,
		scheduledTime: '08:00',
		status: 'given'
	});
	await carer.mar.record({
		clientId: PERSON,
		medicationId: MED,
		day: TODAY,
		scheduledTime: '20:00',
		status: 'refused',
		reason: 'Asleep'
	});
});

afterAll(closeDb);

it('reports this week’s coverage, documentation and care for a home', async () => {
	const r = await (await as(SUP)).analytics.weekly({ homeId: HOME });
	expect(r.weeks).toHaveLength(4);
	const now = (values: (number | null)[]) => values.at(-1);
	expect(now(r.coverage.needingCover)).toBe(2);
	expect(now(r.coverage.fillRate)).toBe(50);
	expect(now(r.coverage.avgFillMinutes)).toBeGreaterThanOrEqual(29);
	expect(now(r.documentation.signed)).toBe(1);
	expect(now(r.documentation.lomiRate)).toBe(0);
	// No Lomi-drafted notes signed yet: no rate rather than 0%.
	expect(now(r.documentation.lomiSentBackRate)).toBeNull();
	expect(now(r.documentation.hoursToApprove)).toBe(0);
	expect(now(r.care.dosesGiven)).toBe(1);
	expect(now(r.care.refusedOrHeld)).toBe(1);
	expect(now(r.care.incidents)).toBe(1);
	expect(r.goalProgress).toEqual([
		expect.objectContaining({
			goalId: GOAL,
			person: 'Marcus',
			text: 'Use a fork',
			trials: 4,
			independentRate: 50
		})
	]);
	// Earlier weeks are empty, not missing.
	expect(r.care.dosesGiven.slice(0, 3)).toEqual([0, 0, 0]);
	// Scheduled doses given out of those due so far (the medication started today).
	const hour = new Date().getUTCHours();
	expect(now(r.care.medCompliance)).toBe(hour < 8 ? null : hour < 20 ? 100 : 50);
	expect(r.care.medCompliance.slice(0, 3)).toEqual([null, null, null]);
	// Last full week: one of two worked shifts has a signed note by the person on shift.
	expect(r.documentation.completeness[2]).toBe(50);
});

it('covers all homes by default and is for supervisors on the Complete plan', async () => {
	const all = await (await as(SUP)).analytics.weekly({});
	expect(all.coverage.needingCover.at(-1)).toBe(3);
	await expect((await as(CARER)).analytics.weekly({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
	await expect((await as(PRO_SUP)).analytics.weekly({})).rejects.toMatchObject({
		code: 'FORBIDDEN'
	});
});

it('reports how many Lomi-drafted notes were sent back', async () => {
	const carer = await as(CARER);
	const drafted = await carer.note.create({
		clientId: PERSON,
		type: 'behavior',
		content: { antecedent: 'Synthetic' },
		lomiDrafted: true
	});
	await carer.note.sign({ id: drafted.id });
	await (await as(SUP)).note.sendBack({ id: drafted.id, comment: 'Add what happened after.' });
	const r = await (await as(SUP)).analytics.weekly({ homeId: HOME });
	expect(r.documentation.lomiSentBackRate.at(-1)).toBe(100);
});
