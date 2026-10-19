// Feature gating by subscription tier (entitlements.md §5-6): tRPC procedures
// and each sync.upload op, against the local Postgres.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';

const { closeDb, withService } = await import('../../../src/lib/server/db');
const s = await import('../../../src/lib/server/db/schema');
const { getCurrentUser } = await import('../../../src/lib/server/services/auth');
const { appRouter } = await import('../../../src/lib/server/trpc/router');
const { createCallerFactory } = await import('../../../src/lib/server/trpc/middleware');
const { TIER_FEATURES } = await import('../../../src/lib/entitlements/tier-features');

const createCaller = createCallerFactory(appRouter);
// Plan gates say which plan a feature needs (entitlements.md §9).
const PLAN_MESSAGE = /requires (an active|a Professional or Complete|a Complete) subscription/;

const STARTER = randomUUID();
const OVERRIDE = randomUUID();
const homes = { starter: randomUUID(), override: randomUUID() };
const people = { starter: randomUUID(), override: randomUUID() };
const uid = (k: string) => `ent-${k}-${STARTER}`;

const as = async (k: string) => createCaller({ user: await getCurrentUser(uid(k)), request: {} });

beforeAll(async () => {
	await withService(async (t) => {
		await t.insert(s.agencies).values([
			{
				id: STARTER,
				name: 'Starter Agency',
				slug: `ent-s-${STARTER}`,
				subscription_tier: 'starter'
			},
			// Starter plus one feature granted by support (entitlements.md "Override behavior")
			{
				id: OVERRIDE,
				name: 'Override Agency',
				slug: `ent-o-${OVERRIDE}`,
				subscription_tier: 'starter',
				enabled_features: ['charting']
			}
		]);
		await t.insert(s.homes).values([
			{ id: homes.starter, agency_id: STARTER, name: 'Oak', lat: 40, lng: -75, radius: 150 },
			{ id: homes.override, agency_id: OVERRIDE, name: 'Pine', lat: 41, lng: -75, radius: 150 }
		]);
		const staff = (k: string, agency: string, home: string, role: 'caregiver' | 'supervisor') => ({
			agency_id: agency,
			auth_uid: uid(k),
			email: `${uid(k)}@example.test`,
			name: k,
			role,
			home_ids: [home]
		});
		await t
			.insert(s.profiles)
			.values([
				staff('cg', STARTER, homes.starter, 'caregiver'),
				staff('sup', STARTER, homes.starter, 'supervisor'),
				staff('ocg', OVERRIDE, homes.override, 'caregiver'),
				staff('osup', OVERRIDE, homes.override, 'supervisor')
			]);
		await t.insert(s.clients).values([
			{ id: people.starter, agency_id: STARTER, home_id: homes.starter, name: 'Person Oak' },
			{ id: people.override, agency_id: OVERRIDE, home_id: homes.override, name: 'Person Pine' }
		]);
	});
});

afterAll(closeDb);

describe('feature gating', () => {
	it('agency.get reports the effective features', async () => {
		const agency = await (await as('cg')).agency.get();
		expect(agency.features).toEqual([...TIER_FEATURES.starter].sort());
		const override = await (await as('ocg')).agency.get();
		expect(override.features).toContain('charting');
		expect(override.features).not.toContain('mar');
	});

	it('a Starter agency keeps the always-available procedures', async () => {
		expect((await (await as('cg')).home.list()).map((h) => h.name)).toEqual(['Oak']);
	});

	it('a Starter agency is refused care-record procedures', async () => {
		const cg = await as('cg');
		await expect(
			cg.note.create({ clientId: people.starter, type: 'shift', content: {} })
		).rejects.toMatchObject({
			code: 'FORBIDDEN',
			message: 'Clinical charting requires a Professional or Complete subscription.',
			// The app reads the missing feature to show its upgrade dialog.
			cause: { name: 'FeatureRequired', feature: 'charting' }
		});
		await expect(cg.health.list({ clientId: people.starter })).rejects.toMatchObject({
			code: 'FORBIDDEN'
		});
		await expect(cg.mar.list({ clientId: people.starter })).rejects.toMatchObject({
			code: 'FORBIDDEN'
		});
	});

	it('a Starter agency is refused Lomi drafting and section edits', async () => {
		const cg = await as('cg');
		await expect(
			cg.lomi.edit({ clientId: people.starter, section: 'meals', current: '', input: 'Test.' })
		).rejects.toMatchObject({ code: 'FORBIDDEN', message: PLAN_MESSAGE });
		await expect(
			cg.lomi.route({
				clientId: people.starter,
				message: 'Test.',
				current: { activities: '', meals: '', mood: '', health: '' }
			})
		).rejects.toMatchObject({ code: 'FORBIDDEN', message: PLAN_MESSAGE });
	});

	it('over HTTP, a plan gate tells the app which feature to offer an upgrade for', async () => {
		const { fetchRequestHandler } = await import('@trpc/server/adapters/fetch');
		const user = await getCurrentUser(uid('cg'));
		const res = await fetchRequestHandler({
			endpoint: '/api/trpc',
			req: new Request(
				`http://localhost/api/trpc/health.list?input=${encodeURIComponent(
					JSON.stringify({ json: { clientId: people.starter } })
				)}`
			),
			router: appRouter,
			createContext: () => ({ user, request: {} })
		});
		const body = await res.json();
		expect(res.status).toBe(403);
		expect(body.error.json.data).toMatchObject({
			code: 'FORBIDDEN',
			upgradeRequired: true,
			feature: 'health'
		});
		expect(body.error.json.message).toBe(
			'Health entry tracking requires a Professional or Complete subscription.'
		);
	});

	it('the plan is checked before the role', async () => {
		// A caregiver on Starter gets the plan message, not "no access".
		await expect((await as('cg')).note.approve({ id: randomUUID() })).rejects.toMatchObject({
			code: 'FORBIDDEN',
			message: PLAN_MESSAGE
		});
	});

	it('an override unlocks exactly that feature', async () => {
		const ocg = await as('ocg');
		const note = await ocg.note.create({ clientId: people.override, type: 'shift', content: {} });
		expect(note.status).toBe('draft');
		await expect(ocg.mar.list({ clientId: people.override })).rejects.toMatchObject({
			code: 'FORBIDDEN'
		});
		// note_review isn't granted, so supervisors still can't approve
		await expect((await as('osup')).note.approve({ id: note.id })).rejects.toMatchObject({
			code: 'FORBIDDEN',
			message: PLAN_MESSAGE
		});
	});

	it('sync.upload checks each op against its own feature', async () => {
		const note = randomUUID();
		const message = randomUUID();
		const r = await (
			await as('cg')
		).sync.upload({
			transactionId: 1,
			ops: [
				{
					op: 'PUT',
					table: 'notes',
					id: note,
					data: {
						client_id: people.starter,
						day: new Date().toISOString().slice(0, 10),
						shift: 'am',
						type: 'shift',
						content: '{}'
					}
				},
				{
					op: 'PUT',
					table: 'messages',
					id: message,
					data: { home_id: homes.starter, body: 'Hello' }
				}
			]
		});
		expect(r.rejected).toEqual([
			{
				id: note,
				table: 'notes',
				index: 0,
				code: 'FEATURE_NOT_INCLUDED',
				message: 'This feature is not included in your agency’s plan.'
			}
		]);
		expect(r.applied).toEqual([message]);
	});
});
