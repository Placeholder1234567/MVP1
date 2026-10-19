// Access review (security.md "Automated Detection", notifications.md §2.20):
// dormant accounts and stale home access reach admins at most weekly, a new
// admin alerts the existing ones, and sign-ins are recorded. Counts only.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';

const { closeDb, withService } = await import('../../../src/lib/server/db');
const s = await import('../../../src/lib/server/db/schema');
const { getCurrentUser, recordSignIn } = await import('../../../src/lib/server/services/auth');
const { appRouter } = await import('../../../src/lib/server/trpc/router');
const mw = await import('../../../src/lib/server/trpc/middleware');
const { setProvidersForTests } = await import('../../../src/lib/server/messaging');
const { reviewAgency } =
	await import('../../../src/lib/server/services/notification/access-review');

const createCaller = mw.createCallerFactory(appRouter);
const agency = randomUUID(),
	oak = randomUUID(),
	elm = randomUUID();
const ada = randomUUID(),
	ben = randomUUID(),
	idle = randomUUID(),
	cara = randomUUID(),
	newbie = randomUUID();
const uid = (id: string) => `access-review-${id}`;
const as = async (id: string) => createCaller({ user: await getCurrentUser(uid(id)), request: {} });
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const day = (n: number) => daysAgo(n).toISOString().slice(0, 10);

const alerts = (profileId: string) =>
	withService((tx) =>
		tx
			.select({ title: s.notifications.title, referenceType: s.notifications.reference_type })
			.from(s.notifications)
			.where(
				and(
					eq(s.notifications.profile_id, profileId),
					eq(s.notifications.type, 'access_review'),
					eq(s.notifications.channel, 'in_app')
				)
			)
	);

beforeAll(async () => {
	const ok = vi.fn(async () => ({ providerMessageId: 'test' }));
	setProvidersForTests({ sms: ok, push: ok, email: ok });
	await withService(async (tx) => {
		await tx.insert(s.agencies).values({
			id: agency,
			name: 'Access Review Test',
			subscription_tier: 'complete',
			slug: `access-review-${agency}`,
			timezone: 'UTC'
		});
		await tx.insert(s.homes).values([
			{ id: oak, agency_id: agency, name: 'Oak', lat: 40, lng: -75, radius: 150 },
			{ id: elm, agency_id: agency, name: 'Elm', lat: 41, lng: -75, radius: 150 }
		]);
		await tx.insert(s.profiles).values(
			(
				[
					[ada, 'admin', [], 200, 0],
					[ben, 'admin', [], 200, 1],
					// Last signed in 100 days ago: dormant.
					[idle, 'caregiver', [], 200, 100],
					// Works at Oak, still has Elm on her list.
					[cara, 'caregiver', [oak, elm], 60, 1],
					// Too new to be flagged for homes she hasn't worked yet.
					[newbie, 'caregiver', [elm], 5, null]
				] as const
			).map(([id, role, homes, age, signedIn]) => ({
				id,
				agency_id: agency,
				auth_uid: uid(id),
				email: `${id}@example.test`,
				name: 'Synthetic Staff',
				role,
				home_ids: [...homes],
				created_at: daysAgo(age),
				last_sign_in_at: signedIn === null ? null : daysAgo(signedIn)
			}))
		);
		await tx.insert(s.scheduleSlots).values({
			agency_id: agency,
			home_id: oak,
			day: day(5),
			shift: 'am',
			assigned_to: cara,
			status: 'filled'
		});
	});
});

afterAll(async () => {
	setProvidersForTests(undefined);
	await closeDb();
});

it('records each new session', async () => {
	const user = (await getCurrentUser(uid(newbie)))!;
	const at = new Date();
	await recordSignIn(user, at);
	const [row] = await withService((tx) =>
		tx.select({ at: s.profiles.last_sign_in_at }).from(s.profiles).where(eq(s.profiles.id, newbie))
	);
	expect(row.at?.getTime()).toBe(at.getTime());
});

it('alerts admins weekly with counts only', async () => {
	const now = new Date();
	expect(await withService((tx) => reviewAgency(tx, agency, 'UTC', now))).toBe(true);
	for (const admin of [ada, ben]) {
		expect(await alerts(admin)).toEqual([
			{
				title:
					'Access review: 1 active account unused for 90+ days; 1 caregiver has home access with no shift there in 30 days',
				referenceType: 'agencies'
			}
		]);
	}
	expect(await alerts(cara)).toEqual([]);
	// Not again for a week.
	expect(await withService((tx) => reviewAgency(tx, agency, 'UTC', now))).toBe(false);
});

it('tells the existing admins when someone is made an admin', async () => {
	await (await as(ada)).staff.update({ id: cara, role: 'admin' });
	for (const admin of [ada, ben]) {
		expect((await alerts(admin)).map((a) => a.title)).toContain(
			'Access review: a new admin account was added'
		);
	}
	expect(await alerts(cara)).toEqual([]);
	// Saving other changes for someone already an admin sends nothing new.
	await (await as(ada)).staff.update({ id: cara, role: 'admin', homeIds: [oak] });
	expect(await alerts(ben)).toHaveLength(2);
});
