import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, withService } from '../../../src/lib/server/db';
import * as s from '../../../src/lib/server/db/schema';
import {
	dispatchNotifications,
	escalate,
	notify,
	RetryLater,
	sendDigest
} from '../../../src/lib/server/services/notification';
import { setProvidersForTests } from '../../../src/lib/server/messaging';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
const agency = randomUUID(),
	oak = randomUUID(),
	elm = randomUUID();
const sup = randomUUID(),
	other = randomUUID(),
	admin = randomUUID();
const sms = vi.fn(async (_to: string, d: { notificationId: string }) => ({
	providerMessageId: `sms-${d.notificationId}`
}));
const push = vi.fn(async () => ({ providerMessageId: 'push' }));
const email = vi.fn(async () => ({ providerMessageId: 'email' }));

beforeAll(async () => {
	setProvidersForTests({ sms, push, email });
	await withService(async (tx) => {
		await tx.insert(s.agencies).values({
			id: agency,
			name: 'Escalation Test',
			subscription_tier: 'complete',
			slug: `esc-${agency}`,
			timezone: 'UTC'
		});
		await tx.insert(s.homes).values([
			{ id: oak, agency_id: agency, name: 'Oak House', lat: 40, lng: -75, radius: 150 },
			{ id: elm, agency_id: agency, name: 'Elm House', lat: 41, lng: -75, radius: 150 }
		]);
		await tx.insert(s.profiles).values(
			[
				[sup, 'supervisor', [oak]],
				[other, 'supervisor', [elm]],
				[admin, 'admin', []]
			].map(([id, role, homes]) => ({
				id: id as string,
				agency_id: agency,
				auth_uid: `esc-${id}`,
				email: `${id}@example.test`,
				phone: `+1555${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`,
				name: 'Synthetic Staff',
				role: role as 'supervisor' | 'admin',
				home_ids: homes as string[]
			}))
		);
	});
});

afterAll(async () => {
	setProvidersForTests(undefined);
	await closeDb();
});

const rows = (reference: string) =>
	withService((tx) =>
		tx
			.select()
			.from(s.notifications)
			.where(
				and(eq(s.notifications.agency_id, agency), eq(s.notifications.reference_id, reference))
			)
	);

async function alert(reference: string) {
	await withService((tx) =>
		notify(tx, agency, [{ id: sup, role: 'supervisor' }], {
			type: 'health_alert',
			priority: 2,
			title: 'Health alert',
			referenceId: reference,
			referenceType: 'health_entries'
		})
	);
	const first = (await rows(reference)).find((r) => r.channel === 'in_app')!;
	return {
		agencyId: agency,
		type: 'health_alert',
		referenceId: reference,
		notificationId: first.id
	};
}

it('escalates an unacknowledged alert: SMS to the supervisor, then SMS to admins, then stops', async () => {
	const reference = randomUUID();
	const event = await alert(reference);

	expect(await escalate({ ...event, step: 1 })).toEqual({ outcome: 'escalated' });
	let all = await rows(reference);
	const supSms = all.filter((r) => r.profile_id === sup && r.channel === 'sms');
	expect(supSms).toHaveLength(1);
	expect(supSms[0].priority).toBe(1);
	expect(all.find((r) => r.channel === 'in_app' && r.profile_id === sup)?.status).toBe('escalated');
	await vi.waitFor(async () =>
		expect((await rows(reference)).find((r) => r.id === supSms[0].id)?.status).toBe('sent')
	);

	expect(await escalate({ ...event, step: 2 })).toEqual({ outcome: 'exhausted' });
	all = await rows(reference);
	// The admin is new to the event: an inbox copy plus the SMS.
	expect(
		all
			.filter((r) => r.profile_id === admin)
			.map((r) => r.channel)
			.sort()
	).toEqual(['in_app', 'sms']);
	expect(
		all.filter((r) => r.channel === 'in_app' && r.profile_id === sup).map((r) => r.status)
	).toEqual(['escalation_exhausted']);
	expect(await escalate({ ...event, step: 3 })).toEqual({ outcome: 'gone' });
});

it('stops as soon as anyone acknowledges the event', async () => {
	const reference = randomUUID();
	const event = await alert(reference);
	await withService((tx) =>
		tx
			.update(s.notifications)
			.set({ read_at: new Date() })
			.where(
				and(eq(s.notifications.agency_id, agency), eq(s.notifications.id, event.notificationId))
			)
	);
	const before = (await rows(reference)).length;
	expect(await escalate({ ...event, step: 1 })).toEqual({ outcome: 'acknowledged' });
	expect((await rows(reference)).length).toBe(before);
});

it('leaves provider failures pending for Cloud Tasks to retry, then fails them on the last attempt', async () => {
	const id = randomUUID();
	await withService((tx) =>
		tx.insert(s.notifications).values({
			id,
			agency_id: agency,
			profile_id: sup,
			type: 'health_alert',
			title: 'Health alert',
			channel: 'sms',
			priority: 1
		})
	);
	sms.mockRejectedValueOnce(new Error('throttled')).mockRejectedValueOnce(new Error('throttled'));
	await expect(dispatchNotifications({ ids: [id] }, { final: false })).rejects.toBeInstanceOf(
		RetryLater
	);
	const status = async () =>
		(
			await withService((tx) =>
				tx
					.select({ status: s.notifications.status })
					.from(s.notifications)
					.where(eq(s.notifications.id, id))
			)
		)[0].status;
	expect(await status()).toBe('pending');
	expect(await dispatchNotifications({ ids: [id] }, { final: true })).toMatchObject({ failed: 1 });
	expect(await status()).toBe('failed');
});

it('sends each supervisor a digest of their homes, with counts and home names only', async () => {
	await withService((tx) =>
		tx.insert(s.coverageRequests).values({
			agency_id: agency,
			home_id: oak,
			day: '2026-10-15',
			shift: 'pm',
			status: 'unfilled'
		})
	);
	expect(await sendDigest({ agencyId: agency })).toMatchObject({ sent: expect.any(Number) });
	const digests = await withService((tx) =>
		tx
			.select()
			.from(s.notifications)
			.where(
				and(
					eq(s.notifications.agency_id, agency),
					eq(s.notifications.type, 'daily_summary'),
					eq(s.notifications.channel, 'in_app')
				)
			)
	);
	const body = (id: string) => digests.find((d) => d.profile_id === id)?.body ?? '';
	expect(body(sup)).toContain('Coverage: 0 filled in the last day, 1 unfilled');
	expect(body(other)).toContain('Coverage: 0 filled in the last day, 0 unfilled');
	expect(body(admin)).toContain('1 unfilled');
	await vi.waitFor(() => expect(email).toHaveBeenCalled());
});
