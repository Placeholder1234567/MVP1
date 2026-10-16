import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
const queue = vi.hoisted(() => ({ enqueue: vi.fn(async () => {}) }));
vi.mock('../../../src/lib/server/jobs/queue', () => ({ enqueue: queue.enqueue, cancel: vi.fn() }));
import { closeDb, withService } from '../../../src/lib/server/db';
import * as s from '../../../src/lib/server/db/schema';
import {
	dispatchNotifications,
	handleSmsEvent,
	RetryLater
} from '../../../src/lib/server/services/notification';
import { setProvidersForTests } from '../../../src/lib/server/messaging';
process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
const agency = randomUUID(),
	otherAgency = randomUUID(),
	profile = randomUUID(),
	otherProfile = randomUUID();
const sms = vi.fn(async () => ({ providerMessageId: 'synthetic-sms' }));
const push = vi.fn(async () => ({ providerMessageId: 'synthetic-push' }));
beforeAll(async () => {
	setProvidersForTests({ sms, push });
	await withService(async (tx) => {
		await tx.insert(s.agencies).values(
			[agency, otherAgency].map((id) => ({
				id,
				name: 'Synthetic Fallback',
				slug: `fallback-${id}`,
				timezone: 'UTC'
			}))
		);
		await tx.insert(s.profiles).values(
			[profile, otherProfile].map((id) => ({
				id,
				agency_id: id === profile ? agency : otherAgency,
				auth_uid: `fallback-${id}`,
				email: `${id}@example.test`,
				name: 'Synthetic Recipient',
				role: 'supervisor' as const,
				phone: '+15555550111'
			}))
		);
		await tx.insert(s.deviceTokens).values({
			agency_id: agency,
			profile_id: profile,
			token: `synthetic-${profile}`,
			platform: 'web'
		});
	});
});
beforeEach(() => {
	queue.enqueue.mockClear();
	sms.mockReset();
	sms.mockResolvedValue({ providerMessageId: 'synthetic-sms' });
	push.mockClear();
});
afterAll(async () => {
	setProvidersForTests(undefined);
	await closeDb();
});
async function source(input: Partial<typeof s.notifications.$inferInsert> = {}) {
	const id = randomUUID();
	await withService((tx) =>
		tx.insert(s.notifications).values({
			id,
			agency_id: agency,
			profile_id: profile,
			type: 'health_alert',
			title: 'Synthetic urgent alert',
			channel: 'sms',
			priority: 1,
			reference_id: randomUUID(),
			reference_type: 'health_entry',
			...input
		})
	);
	return id;
}
async function row(id: string) {
	return (
		await withService((tx) =>
			tx
				.select()
				.from(s.notifications)
				.where(and(eq(s.notifications.agency_id, agency), eq(s.notifications.id, id)))
		)
	)[0];
}
async function pushes(reference: string) {
	return withService((tx) =>
		tx
			.select()
			.from(s.notifications)
			.where(
				and(
					eq(s.notifications.agency_id, agency),
					eq(s.notifications.profile_id, profile),
					eq(s.notifications.channel, 'push'),
					eq(s.notifications.reference_id, reference)
				)
			)
	);
}
it('waits through transient retries, then queues one generic push after terminal SMS failure', async () => {
	const id = await source();
	const original = await row(id);
	sms.mockRejectedValue(new Error('Synthetic provider failure'));
	await expect(dispatchNotifications({ ids: [id] }, { final: false })).rejects.toBeInstanceOf(
		RetryLater
	);
	expect((await row(id)).status).toBe('pending');
	expect(await pushes(original.reference_id!)).toEqual([]);
	expect(await dispatchNotifications({ ids: [id] }, { final: true })).toMatchObject({ failed: 1 });
	const fallback = await pushes(original.reference_id!);
	expect(fallback).toHaveLength(1);
	expect(fallback[0]).toMatchObject({
		status: 'pending',
		priority: 1,
		type: original.type,
		reference_type: original.reference_type,
		title: 'Urgent update requires review',
		body: null
	});
	expect(queue.enqueue).toHaveBeenCalledWith(
		'notifications-push',
		{ ids: [fallback[0].id] },
		{ taskName: `sms-fallback-${id}` }
	);
	expect((await row(fallback[0].id)).status).toBe('pending');
	await dispatchNotifications({ ids: [fallback[0].id] });
	expect(push).toHaveBeenLastCalledWith(
		[`synthetic-${profile}`],
		expect.objectContaining({ title: 'Guad: Action needed', body: 'Open Guad to see details.' })
	);
	await dispatchNotifications({ ids: [id] });
	expect(await pushes(original.reference_id!)).toHaveLength(1);
});
it('deduplicates concurrent provider failure receipts and preserves tenant scope', async () => {
	const providerMessageId = `synthetic-${randomUUID()}`;
	const id = await source({ status: 'sent', provider_message_id: providerMessageId });
	const original = await row(id);
	await withService((tx) =>
		tx.insert(s.notifications).values({
			agency_id: otherAgency,
			profile_id: otherProfile,
			type: original.type,
			title: 'Other tenant',
			channel: 'push',
			status: 'sent',
			reference_id: original.reference_id,
			reference_type: original.reference_type
		})
	);
	await Promise.all(
		Array.from({ length: 4 }, () =>
			handleSmsEvent({ eventType: 'TEXT_BLOCKED', messageId: providerMessageId })
		)
	);
	expect(await pushes(original.reference_id!)).toHaveLength(1);
	expect(queue.enqueue).toHaveBeenCalledTimes(1);
	expect(await handleSmsEvent({ eventType: 'TEXT_BLOCKED', messageId: providerMessageId })).toBe(
		'ignored'
	);
});
it('skips fallback for ordinary failures, acknowledgments and an existing live push', async () => {
	for (const kind of ['normal', 'read', 'push'] as const) {
		const providerMessageId = `synthetic-${randomUUID()}`;
		const id = await source({
			status: 'sent',
			provider_message_id: providerMessageId,
			priority: kind === 'normal' ? 3 : 1
		});
		const original = await row(id);
		if (kind !== 'normal')
			await withService((tx) =>
				tx.insert(s.notifications).values({
					agency_id: agency,
					profile_id: profile,
					type: original.type,
					title: 'Synthetic existing event',
					channel: kind === 'read' ? 'in_app' : 'push',
					status: 'sent',
					read_at: kind === 'read' ? new Date() : null,
					reference_id: original.reference_id,
					reference_type: original.reference_type
				})
			);
		await handleSmsEvent({ eventType: 'TEXT_INVALID', messageId: providerMessageId });
		expect(await pushes(original.reference_id!)).toHaveLength(kind === 'push' ? 1 : 0);
	}
	expect(queue.enqueue).not.toHaveBeenCalled();
});

it('serializes two urgent SMS failures for one event and retries a previously failed push once', async () => {
	const reference = randomUUID();
	await withService((tx) =>
		tx
			.insert(s.notifications)
			.values({
				agency_id: agency,
				profile_id: profile,
				type: 'health_alert',
				title: 'Earlier generic push',
				channel: 'push',
				priority: 1,
				status: 'failed',
				reference_id: reference,
				reference_type: 'health_entry'
			})
	);
	const messages = [`synthetic-${randomUUID()}`, `synthetic-${randomUUID()}`];
	for (const provider_message_id of messages)
		await source({ status: 'sent', provider_message_id, reference_id: reference });
	await Promise.all(
		messages.map((messageId) =>
			handleSmsEvent({ eventType: 'TEXT_CARRIER_UNREACHABLE', messageId })
		)
	);
	const deliveries = await pushes(reference);
	expect(deliveries).toHaveLength(2);
	expect(deliveries.filter((delivery) => delivery.status === 'pending')).toHaveLength(1);
	expect(queue.enqueue).toHaveBeenCalledTimes(1);
});

it('deduplicates a failed SMS even when it has no event reference', async () => {
	const messageId = `synthetic-${randomUUID()}`;
	const id = await source({ status: 'sent', provider_message_id: messageId, reference_id: null });
	await Promise.all(
		Array.from({ length: 3 }, () => handleSmsEvent({ eventType: 'TEXT_TTL_EXPIRED', messageId }))
	);
	const [call] = queue.enqueue.mock.calls;
	expect(call).toBeDefined();
	expect(queue.enqueue).toHaveBeenCalledTimes(1);
	// The queued target is a persisted push row, not a modified/retried SMS.
	const target = (call as unknown as [string, { ids: string[] }])[1].ids[0];
	expect(target).not.toBe(id);
	expect(await row(target)).toMatchObject({
		channel: 'push',
		reference_id: null,
		status: 'pending'
	});
});
it('respects optional push opt-out and never retries an SMS opted out by STOP', async () => {
	await withService((tx) =>
		tx.insert(s.notificationPreferences).values({
			agency_id: agency,
			profile_id: profile,
			notification_type: 'system_maintenance',
			push_enabled: false,
			sms_enabled: false,
			email_enabled: false
		})
	);
	const id = await source({ type: 'system_maintenance' });
	const original = await row(id);
	expect(await dispatchNotifications({ ids: [id] }, { final: false })).toMatchObject({ failed: 1 });
	expect(sms).not.toHaveBeenCalled();
	expect(await pushes(original.reference_id!)).toEqual([]);
	expect(queue.enqueue).not.toHaveBeenCalled();
});
