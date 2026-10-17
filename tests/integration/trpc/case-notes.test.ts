// Case notes (trpc-router.md caseNote.*; services.md §12).
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';

const { closeDb, withService } = await import('../../../src/lib/server/db');
const s = await import('../../../src/lib/server/db/schema');
const { getCurrentUser } = await import('../../../src/lib/server/services/auth');
const { appRouter } = await import('../../../src/lib/server/trpc/router');
const mw = await import('../../../src/lib/server/trpc/middleware');

const createCaller = mw.createCallerFactory(appRouter);
const AGENCY = randomUUID(),
	STARTER = randomUUID(),
	OTHER = randomUUID();
const HOME = randomUUID(),
	PERSON = randomUUID(),
	OTHER_PERSON = randomUUID(),
	OTHER_HOME = randomUUID();
const [SUP, CARER, STARTER_SUP] = [randomUUID(), randomUUID(), randomUUID()];
const uid = (id: string) => `case-${id}`;
const as = async (id: string) => createCaller({ user: await getCurrentUser(uid(id)), request: {} });

beforeAll(async () => {
	await withService(async (t) => {
		await t.insert(s.agencies).values([
			{ id: AGENCY, name: 'Case Test', slug: `case-${AGENCY}`, subscription_tier: 'complete' },
			{ id: STARTER, name: 'Case Starter', slug: `case-${STARTER}`, subscription_tier: 'starter' },
			{ id: OTHER, name: 'Case Other', slug: `case-${OTHER}`, subscription_tier: 'complete' }
		]);
		await t.insert(s.homes).values([
			{ id: HOME, agency_id: AGENCY, name: 'Oak' },
			{ id: OTHER_HOME, agency_id: OTHER, name: 'Pine' }
		]);
		await t.insert(s.profiles).values(
			(
				[
					[SUP, AGENCY, 'supervisor', 'Sam Supervisor'],
					[CARER, AGENCY, 'caregiver', 'Cara Giver'],
					[STARTER_SUP, STARTER, 'supervisor', 'Starter Supervisor']
				] as const
			).map(([id, agency, role, name]) => ({
				id,
				agency_id: agency,
				auth_uid: uid(id),
				email: `${uid(id)}@example.test`,
				name,
				role,
				home_ids: [HOME]
			}))
		);
		await t.insert(s.clients).values([
			{ id: PERSON, agency_id: AGENCY, home_id: HOME, name: 'Synthetic Person' },
			{ id: OTHER_PERSON, agency_id: OTHER, home_id: OTHER_HOME, name: 'Other Person' }
		]);
	});
});

afterAll(closeDb);

it('supervisors add case notes and read them newest first', async () => {
	const sup = await as(SUP);
	const first = await sup.caseNote.create({
		clientId: PERSON,
		body: 'ISP meeting held (synthetic).'
	});
	expect(first).toMatchObject({ clientId: PERSON, authorName: 'Sam Supervisor' });
	await sup.caseNote.create({ clientId: PERSON, body: 'Called guardian (synthetic).' });
	const list = await sup.caseNote.list({ clientId: PERSON });
	expect(list.map((n) => n.body)).toEqual([
		'Called guardian (synthetic).',
		'ISP meeting held (synthetic).'
	]);
	expect((await sup.caseNote.list({ clientId: PERSON, limit: 1, offset: 1 }))[0].id).toBe(first.id);
	await expect(sup.caseNote.create({ clientId: PERSON, body: '   ' })).rejects.toMatchObject({
		code: 'BAD_REQUEST'
	});
});

it('is for supervisors with charting, in their own agency', async () => {
	await expect((await as(CARER)).caseNote.list({ clientId: PERSON })).rejects.toMatchObject({
		code: 'FORBIDDEN'
	});
	await expect(
		(await as(STARTER_SUP)).caseNote.create({ clientId: PERSON, body: 'x' })
	).rejects.toMatchObject({ code: 'FORBIDDEN' });
	await expect(
		(await as(SUP)).caseNote.create({ clientId: OTHER_PERSON, body: 'x' })
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
