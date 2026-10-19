import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
const { closeDb, withService } = await import('../../../src/lib/server/db');
const s = await import('../../../src/lib/server/db/schema');
const { getCurrentUser } = await import('../../../src/lib/server/services/auth');
const { appRouter } = await import('../../../src/lib/server/trpc/router');
const mw = await import('../../../src/lib/server/trpc/middleware');
const caller = mw.createCallerFactory(appRouter);
const agency = randomUUID(),
	other = randomUUID(),
	admin = randomUUID(),
	staff = randomUUID(),
	stranger = randomUUID();
const uid = (id: string) => `overrides-${id}`;
const as = async (id: string) => caller({ user: await getCurrentUser(uid(id)), request: {} });
beforeAll(async () =>
	withService(async (tx) => {
		await tx.insert(s.agencies).values(
			[agency, other].map((id) => ({
				id,
				slug: `overrides-${id}`,
				name: 'Synthetic rules',
				subscription_tier: 'complete',
				settings: { unrelated: 'keep' }
			}))
		);
		await tx.insert(s.profiles).values(
			[
				{ id: admin, agency_id: agency, role: 'admin' as const },
				{ id: staff, agency_id: agency, role: 'caregiver' as const },
				{ id: stranger, agency_id: other, role: 'admin' as const }
			].map((p) => ({
				...p,
				auth_uid: uid(p.id),
				email: `${p.id}@example.test`,
				name: 'Synthetic Staff'
			}))
		);
	})
);
afterAll(() => closeDb());
const rules = {
	disabledTypes: ['shift_reminder' as const],
	requireSummaryEmail: true,
	quietHours: { start: '22:00', end: '06:00' }
};
it('only an admin can save rules and only for their own agency, preserving other settings', async () => {
	await expect(
		(await as(staff)).agency.update({ settings: { notification_overrides: rules } })
	).rejects.toMatchObject({ code: 'FORBIDDEN' });
	const saved = await (
		await as(admin)
	).agency.update({ settings: { notification_overrides: rules } });
	expect(saved?.settings).toMatchObject({ unrelated: 'keep', notification_overrides: rules });
	expect((await (await as(stranger)).agency.get()).settings).toEqual({ unrelated: 'keep' });
	expect(await (await as(staff)).notification.quietHours()).toMatchObject({
		start: '22:00',
		end: '06:00',
		agencySet: true
	});
	await expect(
		(await as(staff)).notification.setQuietHours({ start: '21:00', end: '05:00' })
	).rejects.toThrow('Your agency sets quiet hours.');
});
it('rejects disabling a safety alert and invalid agency quiet hours', async () => {
	const me = await as(admin);
	await expect(
		me.agency.update({
			settings: { notification_overrides: { ...rules, disabledTypes: ['health_alert'] } }
		})
	).rejects.toMatchObject({ code: 'BAD_REQUEST' });
	await expect(
		me.agency.update({
			settings: {
				notification_overrides: { ...rules, quietHours: { start: '22:00', end: '23:00' } }
			}
		})
	).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
