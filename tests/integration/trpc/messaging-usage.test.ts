// agency.messagingUsage (notifications.md "Cost Tracking", "Opt-Out"): this
// month's sent deliveries by channel with an estimated text cost, and who has
// texts off. Admins only.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
const { closeDb, withService } = await import('../../../src/lib/server/db');
const s = await import('../../../src/lib/server/db/schema');
const { getCurrentUser } = await import('../../../src/lib/server/services/auth');
const { setSmsOptOut } = await import('../../../src/lib/server/services/notification');
const { appRouter } = await import('../../../src/lib/server/trpc/router');
const mw = await import('../../../src/lib/server/trpc/middleware');

const caller = mw.createCallerFactory(appRouter);
const agency = randomUUID(),
	admin = randomUUID(),
	cara = randomUUID(),
	sam = randomUUID();
const uid = (id: string) => `usage-${id}`;
const as = async (id: string) => caller({ user: await getCurrentUser(uid(id)), request: {} });

beforeAll(async () => {
	await withService(async (tx) => {
		await tx.insert(s.agencies).values({
			id: agency,
			name: 'Usage Test',
			subscription_tier: 'complete',
			slug: `usage-${agency}`,
			timezone: 'UTC'
		});
		await tx.insert(s.profiles).values(
			(
				[
					[admin, 'admin', 'Ada Synthetic'],
					[cara, 'caregiver', 'Cara Synthetic'],
					[sam, 'supervisor', 'Sam Synthetic']
				] as const
			).map(([id, role, name]) => ({
				id,
				agency_id: agency,
				auth_uid: uid(id),
				email: `${id}@example.test`,
				name,
				role
			}))
		);
		const lastMonth = new Date(Date.now() - 40 * 86_400_000);
		await tx.insert(s.notifications).values(
			(
				[
					['sms', 'sent', new Date()],
					['sms', 'sent', new Date()],
					['sms', 'failed', new Date()],
					['sms', 'sent', lastMonth],
					['email', 'sent', new Date()],
					['push', 'read', new Date()],
					['in_app', 'sent', new Date()]
				] as const
			).map(([channel, status, at]) => ({
				agency_id: agency,
				profile_id: sam,
				type: 'coverage_unfilled',
				priority: 1,
				title: 'Synthetic',
				channel,
				status,
				created_at: at
			}))
		);
		// Cara replied STOP; Sam has preferences with texts still on.
		await setSmsOptOut(tx, agency, { id: cara, role: 'caregiver' }, true);
		await setSmsOptOut(tx, agency, { id: sam, role: 'supervisor' }, false);
	});
});

afterAll(closeDb);

it('counts this month’s sent deliveries and lists who has texts off, for admins only', async () => {
	await expect((await as(sam)).agency.messagingUsage()).rejects.toMatchObject({
		code: 'FORBIDDEN'
	});
	const usage = await (await as(admin)).agency.messagingUsage();
	expect(usage).toMatchObject({ texts: 2, emails: 1, pushes: 1, textCost: '$0.02' });
	expect(usage.month).toMatch(/^\d{4}-\d{2}-01$/);
	expect(usage.textsOff).toEqual([{ id: cara, name: 'Cara Synthetic' }]);
});
