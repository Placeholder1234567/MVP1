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
		await tx.insert(s.agencies).values({ id: agency, name: 'Jobs Test', slug: `jobs-${agency}` });
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
	).toEqual({ sent: 0, held: 0, failed: 0 });
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
		failed: 0
	});
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
