import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { afterCommit, closeDb, withService } from '../../../src/lib/server/db';
import * as s from '../../../src/lib/server/db/schema';
import { notify } from '../../../src/lib/server/services/notification';
import { runJob } from '../../../src/lib/server/jobs/registry';
import { setProvidersForTests } from '../../../src/lib/server/messaging';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
const agency = randomUUID();
const profile = randomUUID();
const email = vi.fn(async () => ({ providerMessageId: 'test-email' }));
const push = vi.fn(async () => ({ providerMessageId: 'test-push' }));

beforeAll(async () => {
	setProvidersForTests({ email, push });
	await withService(async (tx) => {
		await tx.insert(s.agencies).values({
			id: agency,
			name: 'Jobs Test',
			subscription_tier: 'complete',
			slug: `jobs-${agency}`
		});
		await tx.insert(s.profiles).values({
			id: profile,
			agency_id: agency,
			auth_uid: `jobs-${profile}`,
			email: 'synthetic@example.test',
			name: 'Synthetic Supervisor',
			role: 'supervisor'
		});
	});
});

afterAll(async () => {
	setProvidersForTests(undefined);
	await closeDb();
});

const rowsFor = (reference: string) =>
	withService((tx) =>
		tx
			.select()
			.from(s.notifications)
			.where(
				and(eq(s.notifications.agency_id, agency), eq(s.notifications.reference_id, reference))
			)
	);

it('queues only committed notifications and never queues a rolled-back change', async () => {
	const committed = vi.fn();
	await withService(async (tx) => {
		await tx.select().from(s.agencies).where(eq(s.agencies.id, agency));
		afterCommit(committed);
		expect(committed).not.toHaveBeenCalled();
	});
	expect(committed).toHaveBeenCalledOnce();
	const rolledBack = vi.fn();
	const reference = randomUUID();
	await expect(
		withService(async (tx) => {
			await notify(tx, agency, [{ id: profile, role: 'supervisor' }], {
				type: 'daily_summary',
				priority: 3,
				title: 'Daily summary',
				referenceId: reference
			});
			afterCommit(rolledBack);
			throw new Error('Rollback test');
		})
	).rejects.toThrow('Rollback test');
	expect(rolledBack).not.toHaveBeenCalled();
	expect(await rowsFor(reference)).toEqual([]);
});

it('dispatches email, keeps in-app rows, and does not resend completed deliveries', async () => {
	const reference = randomUUID();
	// A saved preference selects email only, independent of local quiet hours.
	await withService(async (tx) => {
		await tx.insert(s.notificationPreferences).values({
			agency_id: agency,
			profile_id: profile,
			notification_type: 'daily_summary',
			push_enabled: false,
			sms_enabled: false,
			email_enabled: true
		});
	});
	await withService((tx) =>
		notify(tx, agency, [{ id: profile, role: 'supervisor' }], {
			type: 'daily_summary',
			priority: 3,
			title: 'Daily summary',
			referenceId: reference
		})
	);
	const rows = await rowsFor(reference);
	expect(rows.map((r) => r.channel).sort()).toEqual(['email', 'in_app']);
	// Let the automatic post-commit dispatch finish before testing a duplicate.
	await vi.waitFor(async () => {
		expect((await rowsFor(reference)).every((r) => r.status === 'sent')).toBe(true);
	});
	const calls = email.mock.calls.length;
	expect(
		await runJob(
			'notifications-dispatch',
			{ ids: rows.map((r) => r.id) },
			{ attempt: 1, final: true }
		)
	).toEqual({ sent: 0, held: 0, failed: 0, suppressed: 0, rateLimited: 0, skipped: 0 });
	expect(email).toHaveBeenCalledTimes(calls);
	expect((await rowsFor(reference)).find((r) => r.channel === 'email')?.provider_message_id).toBe(
		'test-email'
	);
});

it('holds normal push during quiet hours but sends urgent push', async () => {
	// This window contains the current UTC minute, including across midnight.
	const now = new Date();
	const hhmm = (d: Date) => d.toISOString().slice(11, 16);
	await withService(async (tx) => {
		await tx.update(s.agencies).set({ timezone: 'UTC' }).where(eq(s.agencies.id, agency));
		await tx.insert(s.userSettings).values({
			agency_id: agency,
			profile_id: profile,
			quiet_hours_start: hhmm(new Date(now.getTime() - 3600000)),
			quiet_hours_end: hhmm(new Date(now.getTime() + 3600000))
		});
		await tx.insert(s.deviceTokens).values({
			agency_id: agency,
			profile_id: profile,
			token: `synthetic-${profile}`,
			platform: 'web'
		});
	});
	const ids = [randomUUID(), randomUUID()];
	await withService((tx) =>
		tx.insert(s.notifications).values(
			ids.map((id, i) => ({
				id,
				agency_id: agency,
				profile_id: profile,
				type: 'health_alert',
				title: 'Review required',
				channel: 'push',
				priority: i ? 1 : 3
			}))
		)
	);
	expect(await runJob('notifications-dispatch', { ids }, { attempt: 0, final: true })).toEqual({
		sent: 1,
		held: 1,
		failed: 0,
		suppressed: 0,
		rateLimited: 0,
		skipped: 0
	});
});

it('stops at the daily per-person limits; urgent push still goes, email never bypasses', async () => {
	const busy = randomUUID();
	await withService(async (tx) => {
		await tx.insert(s.profiles).values({
			id: busy,
			agency_id: agency,
			auth_uid: `jobs-${busy}`,
			email: 'busy@example.test',
			name: 'Busy Supervisor',
			role: 'supervisor'
		});
		await tx.insert(s.deviceTokens).values({
			agency_id: agency,
			profile_id: busy,
			token: `synthetic-${busy}`,
			platform: 'web'
		});
		// Already sent today: 50 pushes and 20 emails, the limits.
		const sent = (channel: string, n: number) =>
			Array.from({ length: n }, () => ({
				agency_id: agency,
				profile_id: busy,
				type: 'daily_summary' as const,
				title: 'Earlier',
				channel,
				priority: 3,
				status: 'sent' as const,
				sent_at: new Date()
			}));
		await tx.insert(s.notifications).values([...sent('push', 50), ...sent('email', 20)]);
	});
	const [normalPush, urgentPush, urgentEmail] = [randomUUID(), randomUUID(), randomUUID()];
	await withService((tx) =>
		tx.insert(s.notifications).values(
			[
				// High priority skips quiet hours but, unlike urgent, not the limit.
				[normalPush, 'push', 2],
				[urgentPush, 'push', 1],
				[urgentEmail, 'email', 1]
			].map(([id, channel, priority]) => ({
				id: id as string,
				agency_id: agency,
				profile_id: busy,
				type: 'health_alert' as const,
				title: 'Review required',
				channel: channel as string,
				priority: priority as number
			}))
		)
	);
	expect(
		await runJob(
			'notifications-dispatch',
			{ ids: [normalPush, urgentPush, urgentEmail] },
			{ attempt: 0, final: true }
		)
	).toEqual({ sent: 1, rateLimited: 2, held: 0, failed: 0, suppressed: 0, skipped: 0 });
	const status = Object.fromEntries(
		(
			await withService((tx) =>
				tx
					.select({ id: s.notifications.id, status: s.notifications.status })
					.from(s.notifications)
					.where(eq(s.notifications.profile_id, busy))
			)
		).map((r) => [r.id, r.status])
	);
	expect([status[normalPush], status[urgentPush], status[urgentEmail]]).toEqual([
		'rate_limited',
		'sent',
		'rate_limited'
	]);
});

it('sync-window removes old records from device sync without deleting them', async () => {
	const ids = [randomUUID(), randomUUID()];
	await withService((tx) =>
		tx.insert(s.notifications).values(
			ids.map((id, i) => ({
				id,
				agency_id: agency,
				profile_id: profile,
				type: 'daily_summary',
				title: 'Summary',
				channel: 'in_app',
				status: 'sent' as const,
				created_at: new Date(Date.now() - (i ? 1 : 8) * 86400000)
			}))
		)
	);
	await runJob('sync-window', {}, { attempt: 0, final: true });
	const rows = await withService((tx) =>
		tx.select().from(s.notifications).where(eq(s.notifications.agency_id, agency))
	);
	expect(rows.find((r) => r.id === ids[0])?.device_sync).toBe(false);
	expect(rows.find((r) => r.id === ids[1])?.device_sync).toBe(true);
});

it('agency rules require summary email, suppress optional types, and keep safety alerts', async () => {
	const id = randomUUID();
	const staff = randomUUID();
	await withService(async (tx) => {
		await tx.insert(s.agencies).values({
			id,
			name: 'Override test',
			slug: `override-${id}`,
			settings: {
				notification_overrides: {
					disabledTypes: ['shift_reminder', 'health_alert'],
					requireSummaryEmail: true,
					quietHours: null
				}
			}
		});
		await tx.insert(s.profiles).values({
			id: staff,
			agency_id: id,
			auth_uid: `override-${staff}`,
			email: 'override@example.test',
			name: 'Synthetic',
			role: 'supervisor'
		});
		await tx.insert(s.notificationPreferences).values({
			agency_id: id,
			profile_id: staff,
			notification_type: 'daily_summary',
			push_enabled: false,
			email_enabled: false,
			sms_enabled: false
		});
	});
	const summary = randomUUID();
	const optional = randomUUID();
	const safety = randomUUID();
	await withService(async (tx) => {
		const to = [{ id: staff, role: 'supervisor' as const }];
		expect(
			await notify(tx, id, to, {
				type: 'daily_summary',
				title: 'Summary',
				priority: 4,
				referenceId: summary
			})
		).toBe(1);
		expect(
			await notify(tx, id, to, {
				type: 'shift_reminder',
				title: 'Reminder',
				priority: 3,
				referenceId: optional
			})
		).toBe(0);
		expect(
			await notify(tx, id, to, {
				type: 'health_alert',
				title: 'Review',
				priority: 1,
				referenceId: safety
			})
		).toBe(1);
	});
	const rows = await withService((tx) =>
		tx.select().from(s.notifications).where(eq(s.notifications.agency_id, id))
	);
	expect(
		rows
			.filter((r) => r.reference_id === summary)
			.map((r) => r.channel)
			.sort()
	).toEqual(['email', 'in_app']);
	expect(rows.filter((r) => r.reference_id === optional)).toEqual([]);
	expect(
		rows
			.filter((r) => r.reference_id === safety)
			.map((r) => r.channel)
			.sort()
	).toEqual(['in_app', 'push']);
});

it('rechecks agency disabling and quiet hours for already queued deliveries', async () => {
	const id = randomUUID();
	const staff = randomUUID();
	const optional = randomUUID();
	const normal = randomUUID();
	const urgent = randomUUID();
	const hhmm = (offset: number) =>
		new Date(Date.now() + offset * 3600000).toISOString().slice(11, 16);
	await withService(async (tx) => {
		await tx.insert(s.agencies).values({
			id,
			name: 'Dispatch overrides',
			slug: `dispatch-${id}`,
			timezone: 'UTC',
			settings: {
				notification_overrides: {
					disabledTypes: ['shift_reminder'],
					requireSummaryEmail: false,
					quietHours: { start: hhmm(-1), end: hhmm(4) }
				}
			}
		});
		await tx.insert(s.profiles).values({
			id: staff,
			agency_id: id,
			auth_uid: `dispatch-${staff}`,
			email: 'dispatch@example.test',
			name: 'Synthetic',
			role: 'supervisor'
		});
		await tx
			.insert(s.deviceTokens)
			.values({ agency_id: id, profile_id: staff, token: `synthetic-${staff}`, platform: 'web' });
		await tx.insert(s.userSettings).values({
			agency_id: id,
			profile_id: staff,
			quiet_hours_start: hhmm(5),
			quiet_hours_end: hhmm(10)
		});
		await tx.insert(s.notifications).values(
			[
				{ id: optional, type: 'shift_reminder', priority: 1 },
				{ id: normal, type: 'health_alert', priority: 3 },
				{ id: urgent, type: 'health_alert', priority: 1 }
			].map((row) => ({
				...row,
				agency_id: id,
				profile_id: staff,
				channel: 'push',
				title: 'Synthetic'
			}))
		);
	});
	expect(
		await runJob(
			'notifications-dispatch',
			{ ids: [optional, normal, urgent] },
			{ attempt: 0, final: true }
		)
	).toEqual({ sent: 1, held: 1, failed: 0, suppressed: 1, rateLimited: 0, skipped: 0 });
});

it('two dispatches of the same delivery at once send it once', async () => {
	const person = randomUUID();
	const id = randomUUID();
	await withService(async (tx) => {
		await tx.insert(s.profiles).values({
			id: person,
			agency_id: agency,
			auth_uid: `jobs-${person}`,
			email: 'synthetic-claim@example.test',
			name: 'Synthetic Staff',
			role: 'supervisor'
		});
		await tx.insert(s.notifications).values({
			id,
			agency_id: agency,
			profile_id: person,
			type: 'daily_summary',
			title: 'Synthetic claim test',
			channel: 'email',
			priority: 1
		});
	});
	// A slow provider keeps the first send in flight while the second runs.
	const slow = vi.fn(async () => {
		await new Promise((r) => setTimeout(r, 300));
		return { providerMessageId: 'test-slow' };
	});
	setProvidersForTests({ email: slow, push });
	try {
		const [a, b] = await Promise.all([
			runJob('notifications-dispatch', { ids: [id] }, { attempt: 0, final: true }),
			runJob('notifications-dispatch', { ids: [id] }, { attempt: 0, final: true })
		]);
		expect(slow).toHaveBeenCalledOnce();
		expect([a, b].map((r) => (r as { sent: number }).sent).sort()).toEqual([0, 1]);
		expect([a, b].map((r) => (r as { skipped: number }).skipped).sort()).toEqual([0, 1]);
	} finally {
		setProvidersForTests({ email, push });
	}
	const [row] = await withService((tx) =>
		tx.select().from(s.notifications).where(eq(s.notifications.id, id))
	);
	expect(row).toMatchObject({ status: 'sent', provider_message_id: 'test-slow' });
});
