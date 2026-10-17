// Charting preset validation (migration-plan.md Phase 5; CLAUDE.md "NO schema
// branching on charting preset"): the same actions in a "therap" agency and a
// "default" agency must store and return identical data. Only UI labels and
// section order may differ (charting-ux.md §2).
import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';

const { closeDb, withService } = await import('../../../src/lib/server/db');
const s = await import('../../../src/lib/server/db/schema');
const { getCurrentUser } = await import('../../../src/lib/server/services/auth');
const { appRouter } = await import('../../../src/lib/server/trpc/router');
const mw = await import('../../../src/lib/server/trpc/middleware');
const { localTime } = await import('../../../src/lib/domain');

const createCaller = mw.createCallerFactory(appRouter);
const TODAY = localTime(new Date(), 'America/New_York').day;

afterAll(closeDb);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Same shape and values, with generated IDs, times and the agency's own names blanked. */
function normalize(value: unknown): unknown {
	return JSON.parse(
		JSON.stringify(value, (_k, v) => {
			if (typeof v === 'string' && (UUID.test(v) || ISO.test(v))) return '<generated>';
			if (typeof v === 'string' && v.startsWith('preset-')) return '<agency-specific>';
			return v;
		})
	);
}

async function runAs(preset: 'therap' | 'default') {
	const agency = randomUUID(),
		home = randomUUID(),
		person = randomUUID(),
		goal = randomUUID(),
		med = randomUUID();
	const cara = randomUUID(),
		sam = randomUUID();
	const uid = (id: string) => `preset-${id}`;
	await withService(async (t) => {
		await t.insert(s.agencies).values({
			id: agency,
			name: `preset-${preset}`,
			slug: `preset-${agency}`,
			subscription_tier: 'complete',
			charting_preset: preset
		});
		await t
			.insert(s.homes)
			.values({ id: home, agency_id: agency, name: 'Oak', lat: 40, lng: -75, radius: 150 });
		await t.insert(s.profiles).values(
			(
				[
					[cara, 'caregiver'],
					[sam, 'supervisor']
				] as const
			).map(([id, role]) => ({
				id,
				agency_id: agency,
				auth_uid: uid(id),
				email: `${uid(id)}@example.test`,
				name: role === 'caregiver' ? 'Synthetic Caregiver' : 'Synthetic Supervisor',
				role,
				home_ids: [home],
				med_certified: true
			}))
		);
		await t
			.insert(s.clients)
			.values({ id: person, agency_id: agency, home_id: home, name: 'Synthetic Person' });
		await t.insert(s.goals).values({
			id: goal,
			agency_id: agency,
			client_id: person,
			area: 'Daily living',
			text: 'Set the table'
		});
		await t.insert(s.medications).values({
			id: med,
			agency_id: agency,
			client_id: person,
			name: 'Med A',
			dose: '10 mg',
			route: 'oral',
			scheduled_times: ['08:00']
		});
	});
	const as = async (id: string) =>
		createCaller({ user: await getCurrentUser(uid(id)), request: {} });
	const caregiver = await as(cara);
	const supervisor = await as(sam);

	const note = await caregiver.note.create({
		clientId: person,
		type: 'shift',
		content: { activities: 'Walked to the park', meals: 'Ate lunch', mood: 'Calm' },
		goals: [{ goalId: goal, trials: ['Independent', 'Verbal prompt', 'Refused'] }]
	});
	await caregiver.note.sign({ id: note.id });
	await supervisor.note.approve({ id: note.id });
	const behavior = await caregiver.note.create({
		clientId: person,
		type: 'behavior',
		content: { antecedent: 'Loud room', behavior: 'Left the table', consequence: 'Quiet space' }
	});
	const dose = await caregiver.mar.record({
		clientId: person,
		medicationId: med,
		day: TODAY,
		scheduledTime: '08:00',
		status: 'given'
	});
	const incident = await caregiver.incident.create({
		clientId: person,
		type: 'Fall',
		severity: 'Low',
		occurredAt: new Date(Date.now() - 60_000),
		description: 'Synthetic description'
	});
	await caregiver.attendance.save({ clientId: person, day: TODAY, services: ['Day program'] });

	const api = {
		agency: await caregiver.agency.get(),
		note: await supervisor.note.get({ id: note.id }),
		behavior: await caregiver.note.get({ id: behavior.id }),
		dose,
		mar: await caregiver.mar.list({ clientId: person }),
		incident,
		attendance: await caregiver.attendance.list({ clientId: person })
	};
	const db = await withService(async (t) => ({
		// Ordered: an updated row (signed, approved) can move on disk, so the
		// natural order differs between runs when other tests write at the same time.
		notes: await t
			.select()
			.from(s.notes)
			.where(eq(s.notes.agency_id, agency))
			.orderBy(s.notes.type),
		noteGoals: await t.select().from(s.noteGoals).where(eq(s.noteGoals.agency_id, agency)),
		mar: await t.select().from(s.marRecords).where(eq(s.marRecords.agency_id, agency)),
		incidents: await t.select().from(s.incidents).where(eq(s.incidents.agency_id, agency)),
		attendance: await t.select().from(s.attendance).where(eq(s.attendance.agency_id, agency))
	}));
	return { api, db };
}

it('stores and returns identical records for the therap and default presets', async () => {
	const therap = await runAs('therap');
	const plain = await runAs('default');

	// The preset itself is the one visible difference.
	expect((therap.api.agency as { chartingPreset: string }).chartingPreset).toBe('therap');
	expect((plain.api.agency as { chartingPreset: string }).chartingPreset).toBe('default');
	const withoutPreset = (a: unknown) => ({ ...(a as object), chartingPreset: undefined });
	therap.api.agency = withoutPreset(therap.api.agency) as typeof therap.api.agency;
	plain.api.agency = withoutPreset(plain.api.agency) as typeof plain.api.agency;

	expect(normalize(therap.api)).toEqual(normalize(plain.api));
	expect(normalize(therap.db)).toEqual(normalize(plain.db));
	// And the flow really ran: approved note, goal trials, a dose, an incident.
	expect(therap.api.note.status).toBe('approved');
	expect(therap.db.noteGoals).toHaveLength(1);
	expect(therap.db.mar).toHaveLength(1);
	expect(therap.db.incidents).toHaveLength(1);
});
