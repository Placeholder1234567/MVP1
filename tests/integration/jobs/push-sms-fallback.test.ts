// Mandatory alerts reach someone with no push device by text, unless they
// replied STOP (notifications.md §5 "Permission Denied Fallback").
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
const queue = vi.hoisted(() => ({ enqueue: vi.fn(async () => {}) }));
vi.mock('../../../src/lib/server/jobs/queue', () => ({ enqueue: queue.enqueue, cancel: vi.fn() }));
import { closeDb, withService } from '../../../src/lib/server/db';
import * as s from '../../../src/lib/server/db/schema';
import { dispatchNotifications } from '../../../src/lib/server/services/notification';
import { setProvidersForTests } from '../../../src/lib/server/messaging';
process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
const agency = randomUUID(),
	noDevice = randomUUID(),
	stopped = randomUUID(),
	noPhone = randomUUID();
const sms = vi.fn(async () => ({ providerMessageId: 'synthetic-sms' }));
const push = vi.fn(async () => ({ providerMessageId: 'synthetic-push' }));
beforeAll(async () => {
	setProvidersForTests({ sms, push });
	await withService(async (tx) => {
		await tx.insert(s.agencies).values({
			id: agency,
			name: 'Push Fallback',
			slug: `push-fallback-${agency}`,
			timezone: 'UTC'
		});
		await tx.insert(s.profiles).values(
			[noDevice, stopped, noPhone].map((id) => ({
				id,
				agency_id: agency,
				auth_uid: `push-fallback-${id}`,
				email: `${id}@example.test`,
				name: 'Synthetic Caregiver',
				role: 'caregiver' as const,
				phone: id === noPhone ? null : '+15555550122'
			}))
		);
		// What a STOP reply saves (setSmsOptOut): texts off for every type.
		await tx.insert(s.notificationPreferences).values({
			agency_id: agency,
			profile_id: stopped,
			notification_type: 'health_alert',
			push_enabled: true,
			sms_enabled: false,
			email_enabled: false
		});
	});
});
beforeEach(() => {
	queue.enqueue.mockClear();
	sms.mockClear();
});
afterAll(async () => {
	setProvidersForTests(undefined);
	await closeDb();
});
async function pushRow(profile: string, input: Partial<typeof s.notifications.$inferInsert> = {}) {
	const id = randomUUID();
	const reference = randomUUID();
	await withService((tx) =>
		tx.insert(s.notifications).values({
			id,
			agency_id: agency,
			profile_id: profile,
			type: 'health_alert',
			title: 'A health reading needs review',
			channel: 'push',
			priority: 1,
			reference_id: reference,
			reference_type: 'health_entries',
			...input
		})
	);
	return { id, reference };
}
const texts = (reference: string) =>
	withService((tx) =>
		tx
			.select()
			.from(s.notifications)
			.where(
				and(
					eq(s.notifications.agency_id, agency),
					eq(s.notifications.reference_id, reference),
					eq(s.notifications.channel, 'sms')
				)
			)
	);

it('texts a mandatory alert when the person has no push device, once', async () => {
	const { id, reference } = await pushRow(noDevice);
	expect(await dispatchNotifications({ ids: [id] })).toMatchObject({ failed: 1 });
	const [text] = await texts(reference);
	expect(text).toMatchObject({
		profile_id: noDevice,
		type: 'health_alert',
		priority: 1,
		status: 'pending',
		title: 'A health reading needs review'
	});
	expect(queue.enqueue).toHaveBeenCalledWith(
		'notifications-sms',
		{ ids: [text.id] },
		{ taskName: `push-fallback-${id}` }
	);
	await dispatchNotifications({ ids: [text.id] });
	expect(sms).toHaveBeenCalledTimes(1);
	// Running the failed push again adds nothing.
	await dispatchNotifications({ ids: [id] });
	expect(await texts(reference)).toHaveLength(1);
});

it('never texts someone who replied STOP, or who has no phone', async () => {
	for (const profile of [stopped, noPhone]) {
		const { id, reference } = await pushRow(profile);
		await dispatchNotifications({ ids: [id] });
		expect(await texts(reference)).toEqual([]);
	}
	expect(queue.enqueue).not.toHaveBeenCalled();
});

it('does not text optional alerts, acknowledged ones, or ones already texted', async () => {
	const optional = await pushRow(noDevice, { type: 'shift_reminder', priority: 3 });
	await dispatchNotifications({ ids: [optional.id] });
	expect(await texts(optional.reference)).toEqual([]);

	const read = await pushRow(noDevice, { read_at: new Date() });
	await dispatchNotifications({ ids: [read.id] });
	expect(await texts(read.reference)).toEqual([]);

	const texted = await pushRow(noDevice);
	await withService((tx) =>
		tx.insert(s.notifications).values({
			agency_id: agency,
			profile_id: noDevice,
			type: 'health_alert',
			title: 'A health reading needs review',
			channel: 'sms',
			priority: 1,
			status: 'sent',
			reference_id: texted.reference,
			reference_type: 'health_entries'
		})
	);
	await dispatchNotifications({ ids: [texted.id] });
	expect(await texts(texted.reference)).toHaveLength(1);
});
