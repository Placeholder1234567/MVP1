import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
vi.mock('../../../src/lib/server/jobs/queue', () => ({
	enqueue: vi.fn(async () => {}),
	cancel: vi.fn()
}));
import { closeDb, withService } from '../../../src/lib/server/db';
import * as s from '../../../src/lib/server/db/schema';
import {
	notify,
	dispatchNotifications,
	setSmsOptOut,
	smsCarrierSuppressed
} from '../../../src/lib/server/services/notification';
import { getCurrentUser } from '../../../src/lib/server/services/auth';
import { appRouter } from '../../../src/lib/server/trpc/router';
import { createCallerFactory } from '../../../src/lib/server/trpc/middleware';
import { setProvidersForTests } from '../../../src/lib/server/messaging';
process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
const agency = randomUUID(),
	foreign = randomUUID();
const staff = Array.from({ length: 7 }, (_, i) => ({
	id: randomUUID(),
	phone: `+1555000090${i}`,
	role: (i === 4 ? 'caregiver' : i === 5 ? 'admin' : 'supervisor') as
		'caregiver' | 'supervisor' | 'admin'
}));
const sms = vi.fn(async () => ({ providerMessageId: 'synthetic-required-sms' }));
const caller = createCallerFactory(appRouter);
const admin = async () =>
	caller({ user: await getCurrentUser(`required-${staff[5].id}`), request: {} });
const rules = (required: boolean) => ({
	disabledTypes: [],
	quietHours: null,
	requireSummaryEmail: false,
	forceSmsTypes: required ? ['daily_summary' as const] : []
});
async function policy(required: boolean) {
	await (await admin()).agency.update({ settings: { notification_overrides: rules(required) } });
}
async function preference(id: string) {
	await withService((tx) =>
		tx
			.update(s.notificationPreferences)
			.set({ sms_enabled: false, push_enabled: false, email_enabled: false })
			.where(
				and(
					eq(s.notificationPreferences.agency_id, agency),
					eq(s.notificationPreferences.profile_id, id),
					eq(s.notificationPreferences.notification_type, 'daily_summary')
				)
			)
	);
}
async function queueOne() {
	await withService((tx) =>
		notify(tx, agency, [staff[0]], {
			type: 'daily_summary',
			priority: 1,
			title: 'Synthetic summary'
		})
	);
	return withService((tx) =>
		tx
			.select({ id: s.notifications.id })
			.from(s.notifications)
			.where(
				and(
					eq(s.notifications.agency_id, agency),
					eq(s.notifications.profile_id, staff[0].id),
					eq(s.notifications.channel, 'sms'),
					eq(s.notifications.status, 'pending')
				)
			)
	);
}
beforeAll(async () => {
	setProvidersForTests({ sms });
	await withService(async (tx) => {
		await tx.insert(s.agencies).values(
			[agency, foreign].map((id) => ({
				id,
				slug: `required-${id}`,
				name: 'Synthetic required SMS',
				subscription_tier: 'complete' as const
			}))
		);
		await tx.insert(s.profiles).values(
			staff.map((person, i) => ({
				...person,
				agency_id: i === 6 ? foreign : agency,
				auth_uid: `required-${person.id}`,
				email: `${person.id}@example.test`,
				name: 'Synthetic staff'
			}))
		);
		await tx.insert(s.notificationPreferences).values(
			staff.map((person) => ({
				agency_id: person === staff[6] ? foreign : agency,
				profile_id: person.id,
				notification_type: 'daily_summary',
				sms_enabled: false,
				push_enabled: false,
				email_enabled: false
			}))
		);
		for (const i of [0, 4, 5]) await setSmsOptOut(tx, agency, staff[i], false, staff[i].phone);
		await setSmsOptOut(tx, agency, staff[2], true, staff[2].phone);
		await smsCarrierSuppressed(tx, agency, staff[3].phone);
	});
	for (const i of [0, 4, 5]) await preference(staff[i].id);
	await policy(true);
});
afterAll(async () => {
	setProvidersForTests(undefined);
	await closeDb();
});
it('requires SMS only for a current supervisor with verified START, without preview side effects', async () => {
	const before = await withService((tx) =>
		tx.select().from(s.smsCarrierConsents).where(eq(s.smsCarrierConsents.agency_id, agency))
	);
	const previews = await withService((tx) =>
		notify(
			tx,
			agency,
			staff,
			{ type: 'daily_summary', priority: 1, title: 'Synthetic summary' },
			{ preview: true }
		)
	);
	expect(previews.filter((row) => row.channel === 'sms').map((row) => row.profileId)).toEqual([
		staff[0].id
	]);
	expect(
		await withService((tx) =>
			tx.select().from(s.smsCarrierConsents).where(eq(s.smsCarrierConsents.agency_id, agency))
		)
	).toEqual(before);
	expect(sms).not.toHaveBeenCalled();
	const pending = await queueOne();
	expect(pending).toHaveLength(1);
	expect(await dispatchNotifications({ ids: pending.map((row) => row.id) })).toMatchObject({
		sent: 1
	});
	expect(sms).toHaveBeenCalledOnce();
});
it('rechecks removed policy, STOP and changed phone before sending a pending required SMS', async () => {
	let pending = await queueOne();
	await policy(false);
	expect(await dispatchNotifications({ ids: pending.map((row) => row.id) })).toMatchObject({
		sent: 0,
		failed: 1
	});
	await policy(true);
	pending = await queueOne();
	await withService((tx) => setSmsOptOut(tx, agency, staff[0], true, staff[0].phone));
	expect(await dispatchNotifications({ ids: pending.map((row) => row.id) })).toMatchObject({
		sent: 0,
		failed: 1
	});
	await withService((tx) => setSmsOptOut(tx, agency, staff[0], false, staff[0].phone));
	await preference(staff[0].id);
	pending = await queueOne();
	await withService((tx) =>
		tx
			.update(s.profiles)
			.set({ role: 'caregiver' })
			.where(and(eq(s.profiles.agency_id, agency), eq(s.profiles.id, staff[0].id)))
	);
	expect(await dispatchNotifications({ ids: pending.map((row) => row.id) })).toMatchObject({
		sent: 0,
		failed: 1
	});
	await withService((tx) =>
		tx
			.update(s.profiles)
			.set({ role: 'supervisor' })
			.where(and(eq(s.profiles.agency_id, agency), eq(s.profiles.id, staff[0].id)))
	);
	pending = await queueOne();
	await withService((tx) =>
		tx
			.update(s.profiles)
			.set({ phone: '+15550000888' })
			.where(and(eq(s.profiles.agency_id, agency), eq(s.profiles.id, staff[0].id)))
	);
	expect(await dispatchNotifications({ ids: pending.map((row) => row.id) })).toMatchObject({
		sent: 0,
		failed: 1
	});
	expect(sms).toHaveBeenCalledOnce();
});
