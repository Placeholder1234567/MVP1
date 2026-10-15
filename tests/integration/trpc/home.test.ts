// tRPC procedures called through the real router, as real users, against the
// local Docker Postgres. Proves procedures run inside withUser() (RLS applies).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';

const { closeDb, withService } = await import('../../../src/lib/server/db');
const { agencies, homes, profiles } = await import('../../../src/lib/server/db/schema');
const { getCurrentUser } = await import('../../../src/lib/server/services/auth');
const { appRouter } = await import('../../../src/lib/server/trpc/router');
const { createCallerFactory } = await import('../../../src/lib/server/trpc/middleware');

const createCaller = createCallerFactory(appRouter);

const AGENCY = randomUUID();
const OTHER_AGENCY = randomUUID();
const OAK = randomUUID();
const MAPLE = randomUUID();
const PINE = randomUUID();
const CG_UID = `trpc-cg-${randomUUID()}`;
const SUP_UID = `trpc-sup-${randomUUID()}`;

async function callerFor(authUid: string | null) {
	const user = authUid ? await getCurrentUser(authUid) : null;
	return createCaller({ user, request: { ip: '203.0.113.9', user_agent: 'vitest' } });
}

beforeAll(async () => {
	await withService(async (tx) => {
		await tx.insert(agencies).values([
			{ id: AGENCY, name: 'tRPC Test Agency', subscription_tier: 'complete', slug: `trpc-${AGENCY}` },
			{ id: OTHER_AGENCY, name: 'Other Agency', subscription_tier: 'complete', slug: `trpc-other-${OTHER_AGENCY}` }
		]);
		await tx.insert(homes).values([
			{ id: OAK, agency_id: AGENCY, name: 'Oak', lat: 40, lng: -75, radius: 150 },
			{ id: MAPLE, agency_id: AGENCY, name: 'Maple', lat: 41, lng: -75, radius: 150 },
			{ id: PINE, agency_id: OTHER_AGENCY, name: 'Pine', lat: 42, lng: -75, radius: 150 }
		]);
		await tx.insert(profiles).values([
			{
				agency_id: AGENCY,
				auth_uid: CG_UID,
				email: `${CG_UID}@example.test`,
				name: 'Cara Giver',
				role: 'caregiver',
				home_ids: [OAK]
			},
			{
				agency_id: AGENCY,
				auth_uid: SUP_UID,
				email: `${SUP_UID}@example.test`,
				name: 'Sam Supervisor',
				role: 'supervisor',
				home_ids: [OAK, MAPLE]
			}
		]);
	});
});

afterAll(closeDb);

describe('tRPC', () => {
	it('rejects callers who are not signed in', async () => {
		const anon = await callerFor(null);
		await expect(anon.home.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
	});

	it('auth.me returns the caller’s own profile', async () => {
		const me = await (await callerFor(CG_UID)).auth.me();
		expect(me).toMatchObject({
			name: 'Cara Giver',
			role: 'caregiver',
			agencyId: AGENCY,
			homeIds: [OAK]
		});
	});

	it('agency.get returns the caller’s agency with defaults filled in', async () => {
		const agency = await (await callerFor(CG_UID)).agency.get();
		expect(agency).toMatchObject({ id: AGENCY, subscriptionTier: 'complete', enabledFeatures: [] });
	});

	it('home.list: a caregiver sees their own homes, a supervisor sees all, nobody sees other agencies', async () => {
		const cg = await (await callerFor(CG_UID)).home.list();
		const sup = await (await callerFor(SUP_UID)).home.list();
		expect(cg.map((h) => h.name)).toEqual(['Oak']);
		expect(sup.map((h) => h.name)).toEqual(['Maple', 'Oak']);
	});

	it('home.get outside the caller’s access is NOT_FOUND, not a leak', async () => {
		const cg = await callerFor(CG_UID);
		await expect(cg.home.get({ id: MAPLE })).rejects.toMatchObject({ code: 'NOT_FOUND' });
		await expect(cg.home.get({ id: PINE })).rejects.toMatchObject({ code: 'NOT_FOUND' });
		expect((await cg.home.get({ id: OAK })).name).toBe('Oak');
	});

	it('unexpected errors reach the client as a reference ID only, never the message', async () => {
		const { fetchRequestHandler } = await import('@trpc/server/adapters/fetch');
		const { router, userProcedure } = await import('../../../src/lib/server/trpc/middleware');
		const leaky = router({
			boom: userProcedure.query(() => {
				// Like a Drizzle error, whose message includes query parameters
				throw new Error('Failed query: select ... params: Marcus Demo, 1990-01-01');
			})
		});
		const user = await getCurrentUser(CG_UID);
		const errors: string[] = [];
		const original = console.error;
		console.error = (...args: unknown[]) => errors.push(args.join(' '));
		try {
			const res = await fetchRequestHandler({
				endpoint: '/api/trpc',
				req: new Request('http://localhost/api/trpc/boom'),
				router: leaky,
				createContext: () => ({ user, request: {} })
			});
			const body = await res.text();
			expect(res.status).toBe(500);
			expect(body).not.toMatch(/Marcus|1990|Failed query/);
			expect(body).toMatch(/Something went wrong \(ref: [0-9a-f]{8}\)/);
			expect(errors.join('\n')).not.toMatch(/Marcus|1990/);
		} finally {
			console.error = original;
		}
	});

	it('validates input with Zod', async () => {
		const cg = await callerFor(CG_UID);
		await expect(cg.home.get({ id: 'not-a-uuid' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
	});
});
