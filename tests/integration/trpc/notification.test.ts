import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { closeDb, withService } from '../../../src/lib/server/db';
import * as s from '../../../src/lib/server/db/schema';
import { getCurrentUser } from '../../../src/lib/server/services/auth';
import { notify } from '../../../src/lib/server/services/notification';
import { createCallerFactory } from '../../../src/lib/server/trpc/middleware';
import { appRouter } from '../../../src/lib/server/trpc/router';
import { setProvidersForTests } from '../../../src/lib/server/messaging';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
const agency = randomUUID(),
	other = randomUUID(),
	caregiver = randomUUID(),
	admin = randomUUID(),
	foreign = randomUUID();
const caller = createCallerFactory(appRouter);
const as = async (id: string) =>
	caller({ user: await getCurrentUser(`alerts-${id}`), request: {} });
const reference = randomUUID();
const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
beforeAll(async () => {
	setProvidersForTests({
		push: async () => ({ providerMessageId: 'synthetic-push' }),
		sms: async () => ({ providerMessageId: 'synthetic-sms' }),
		email: async () => ({ providerMessageId: 'synthetic-email' })
	});
	await withService(async (tx) => {
		await tx.insert(s.agencies).values([
			{
				id: agency,
				name: 'Synthetic Alerts',
				subscription_tier: 'complete',
				slug: `alerts-${agency}`
			},
			{
				id: other,
				name: 'Other Synthetic Alerts',
				subscription_tier: 'complete',
				slug: `alerts-${other}`
			}
		]);
		await tx.insert(s.profiles).values(
			[caregiver, admin, foreign].map((id) => ({
				id,
				agency_id: id === foreign ? other : agency,
				auth_uid: `alerts-${id}`,
				email: `${id}@example.test`,
				name: 'Synthetic Alert Recipient',
				phone: '+15555550111',
				role: id === caregiver ? ('caregiver' as const) : ('admin' as const)
			}))
		);
		await tx.insert(s.deviceTokens).values({
			agency_id: agency,
			profile_id: admin,
			token: `synthetic-${admin}`,
			platform: 'web'
		});
		await tx.insert(s.notifications).values(
			ids.map((id, i) => ({
				id,
				agency_id: i === 3 ? other : agency,
				profile_id: i < 2 ? caregiver : i === 2 ? admin : foreign,
				type: 'coverage_accepted',
				title: 'Synthetic shift update',
				channel: i === 1 ? 'push' : 'in_app',
				status: 'sent' as const,
				reference_id: reference
			}))
		);
	});
});
afterAll(async () => {
	vi.unstubAllEnvs();
	setProvidersForTests(undefined);
	await closeDb();
});

it('edits only own quiet hours, preserves other settings and reports the agency zone', async () => {
	const cg = (await as(caregiver)).notification;
	const ad = (await as(admin)).notification;
	expect(await cg.quietHours()).toMatchObject({ start: '23:00', end: '06:00' });
	await withService(async (tx) => {
		await tx.insert(s.userSettings).values({
			agency_id: agency,
			profile_id: caregiver,
			theme: 'dark',
			disclosure: { example: 2 }
		});
		await tx
			.update(s.agencies)
			.set({ timezone: 'America/New_York' })
			.where(eq(s.agencies.id, agency));
	});
	expect(await cg.setQuietHours({ start: '21:30', end: '05:30' })).toEqual({
		start: '21:30',
		end: '05:30',
		timeZone: 'America/New_York'
	});
	expect(await ad.quietHours()).toMatchObject({ start: '23:00', end: '06:00' });
	const [row] = await withService((tx) =>
		tx.select().from(s.userSettings).where(eq(s.userSettings.profile_id, caregiver))
	);
	expect(row).toMatchObject({ theme: 'dark', disclosure: { example: 2 } });
	for (const value of [
		{ start: '23:00', end: '00:00' },
		{ start: '20:00', end: '06:01' },
		{ start: '00:00', end: '00:00' },
		{ start: '25:00', end: '06:00' }
	]) {
		await expect(cg.setQuietHours(value)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
	}
	expect(await cg.quietHours()).toMatchObject({ start: '21:30', end: '05:30' });
});

it('manages own push registrations without exposing or transferring tokens', async () => {
	vi.stubEnv('PUSH_DRIVER', 'fcm'); // Registration writes only; no provider is invoked.
	try {
		const cg = (await as(caregiver)).notification;
		const ad = (await as(admin)).notification;
		const foreignApi = (await as(foreign)).notification;
		const token = `synthetic-token:${randomUUID()}`;
		const created = await cg.registerPushDevice({ token, platform: 'web' });
		expect(await cg.registerPushDevice({ token, platform: 'ios' })).toEqual(created);
		const rows = await cg.pushDevices();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ id: created.id, platform: 'ios' });
		expect(JSON.stringify(rows)).not.toContain(token);
		expect(Object.keys(rows[0]).sort()).toEqual(['createdAt', 'id', 'lastSeenAt', 'platform']);
		expect(await ad.removePushDevice(created)).toEqual({ removed: false });
		expect(await foreignApi.removePushDevice(created)).toEqual({ removed: false });
		await expect(foreignApi.registerPushDevice({ token, platform: 'web' })).rejects.toMatchObject({
			code: 'CONFLICT'
		});
		const previous = await foreignApi.registerPushDevice({
			token: `synthetic:${randomUUID()}`,
			platform: 'web'
		});
		await expect(
			foreignApi.registerPushDevice({ token, platform: 'web', previousId: previous.id })
		).rejects.toMatchObject({ code: 'CONFLICT' });
		expect((await foreignApi.pushDevices()).some((row) => row.id === previous.id)).toBe(true);
		await foreignApi.removePushDevice(previous);
		expect(await cg.removePushDevice(created)).toEqual({ removed: true });
		expect(await cg.removePushDevice(created)).toEqual({ removed: false });
		expect(await cg.pushDevices()).toEqual([]);
		await expect(cg.registerPushDevice({ token: 'bad', platform: 'web' })).rejects.toMatchObject({
			code: 'BAD_REQUEST'
		});
	} finally {
		vi.unstubAllEnvs();
	}
});

it('does not pretend to register push when the provider is unconfigured', async () => {
	vi.stubEnv('PUSH_DRIVER', 'console');
	try {
		await expect(
			(await as(caregiver)).notification.registerPushDevice({
				token: `synthetic:${randomUUID()}`,
				platform: 'web'
			})
		).rejects.toMatchObject({ code: 'CONFLICT' });
	} finally {
		vi.unstubAllEnvs();
	}
});

it('bounds push registrations while allowing an existing device to refresh', async () => {
	vi.stubEnv('PUSH_DRIVER', 'fcm');
	try {
		const api = (await as(foreign)).notification;
		const tokens = Array.from({ length: 10 }, () => `synthetic:${randomUUID()}`);
		const devices = [];
		for (const token of tokens)
			devices.push(await api.registerPushDevice({ token, platform: 'web' }));
		await expect(
			api.registerPushDevice({ token: `synthetic:${randomUUID()}`, platform: 'web' })
		).rejects.toMatchObject({ code: 'CONFLICT' });
		expect(await api.registerPushDevice({ token: tokens[0], platform: 'web' })).toEqual(devices[0]);
		expect(await api.pushDevices()).toHaveLength(10);
		const rotated = await api.registerPushDevice({
			token: `rotated:${randomUUID()}`,
			platform: 'web',
			previousId: devices[0].id
		});
		expect(rotated.id).not.toBe(devices[0].id);
		expect(await api.pushDevices()).toHaveLength(10);
		expect((await api.pushDevices()).some((row) => row.id === devices[0].id)).toBe(false);
	} finally {
		vi.unstubAllEnvs();
	}
});
const stored = (profile: string) =>
	withService((tx) =>
		tx
			.select()
			.from(s.notificationPreferences)
			.where(
				and(
					eq(s.notificationPreferences.agency_id, agency),
					eq(s.notificationPreferences.profile_id, profile)
				)
			)
	);

it('requires sign-in and scopes list/detail to the recipient, including admins', async () => {
	await expect(caller({ user: null, request: {} }).notification.list({})).rejects.toMatchObject({
		code: 'UNAUTHORIZED'
	});
	const cg = (await as(caregiver)).notification,
		ad = (await as(admin)).notification;
	expect((await cg.list({})).map((r) => r.id).sort()).toEqual(ids.slice(0, 2).sort());
	expect((await ad.list({})).map((r) => r.id)).toEqual([ids[2]]);
	await expect(ad.get({ id: ids[0] })).rejects.toMatchObject({ code: 'NOT_FOUND' });
	await expect(cg.get({ id: ids[3] })).rejects.toMatchObject({ code: 'NOT_FOUND' });
	expect((await cg.list({ channel: 'in_app', limit: 1 })).map((r) => r.id)).toEqual([ids[0]]);
	expect(await cg.list({ offset: 2 })).toEqual([]);
});

it('acknowledges the event across channels only for its recipient and preserves delivery fields', async () => {
	const api = (await as(caregiver)).notification;
	expect(await api.markRead({ ids: [ids[0], ids[2], ids[3]] })).toEqual({ updated: 2 });
	const rows = await withService((tx) =>
		tx.select().from(s.notifications).where(inArray(s.notifications.id, ids))
	);
	for (const row of rows) {
		expect(!!row.read_at).toBe(row.profile_id === caregiver);
		expect(row.status).toBe('sent');
		expect(row.title).toBe('Synthetic shift update');
	}
	const first = (await api.get({ id: ids[0] })).readAt;
	expect(await api.markRead({ ids: [ids[0]] })).toEqual({ updated: 0 });
	expect((await api.get({ id: ids[0] })).readAt).toEqual(first);
	expect(await api.list({ unreadOnly: true })).toEqual([]);
	expect(await (await as(admin)).notification.markRead({ ids: [ids[3]] })).toEqual({ updated: 0 });
});

it('does not acknowledge unrelated notifications with missing event references', async () => {
	const own = [randomUUID(), randomUUID()];
	await withService((tx) =>
		tx.insert(s.notifications).values(
			own.map((id) => ({
				id,
				agency_id: agency,
				profile_id: caregiver,
				type: 'system_maintenance',
				title: 'Synthetic maintenance',
				channel: 'in_app'
			}))
		)
	);
	const api = (await as(caregiver)).notification;
	expect(await api.markRead({ ids: [own[0]] })).toEqual({ updated: 1 });
	expect((await api.get({ id: own[1] })).readAt).toBeNull();
});

it('merges partial preferences with role defaults and serializes concurrent edits', async () => {
	const api = (await as(caregiver)).notification;
	await api.updatePreferences({
		preferences: [{ notificationType: 'coverage_offer', smsEnabled: false }]
	});
	expect(
		(await stored(caregiver)).find((r) => r.notification_type === 'coverage_offer')
	).toMatchObject({ push_enabled: true, sms_enabled: false, email_enabled: false });
	await Promise.all([
		api.updatePreferences({
			preferences: [{ notificationType: 'coverage_offer', emailEnabled: true }]
		}),
		api.updatePreferences({
			preferences: [{ notificationType: 'coverage_offer', pushEnabled: false }]
		})
	]);
	expect(
		(await stored(caregiver)).find((r) => r.notification_type === 'coverage_offer')
	).toMatchObject({ push_enabled: false, sms_enabled: false, email_enabled: true });
	expect(await stored(admin)).toEqual([]);
});

it('retains mandatory safety channels and uses saved choices when queuing notifications', async () => {
	const api = (await as(admin)).notification;
	await api.updatePreferences({
		preferences: [
			{
				notificationType: 'med_possible_double_dose',
				pushEnabled: false,
				smsEnabled: false,
				emailEnabled: false
			},
			{
				notificationType: 'daily_summary',
				pushEnabled: false,
				smsEnabled: false,
				emailEnabled: false
			}
		]
	});
	expect(
		(await stored(admin)).find((r) => r.notification_type === 'med_possible_double_dose')
	).toMatchObject({ push_enabled: true, sms_enabled: true, email_enabled: false });
	const refs = [randomUUID(), randomUUID()];
	for (const [i, type] of ['med_possible_double_dose', 'daily_summary'].entries()) {
		await withService((tx) =>
			notify(tx, agency, [{ id: admin, role: 'admin' }], {
				type,
				priority: 1,
				title: 'Synthetic required review',
				referenceId: refs[i]
			})
		);
	}
	const rows = await withService((tx) =>
		tx
			.select()
			.from(s.notifications)
			.where(
				and(eq(s.notifications.agency_id, agency), inArray(s.notifications.reference_id, refs))
			)
	);
	expect(
		rows
			.filter((r) => r.reference_id === refs[0])
			.map((r) => r.channel)
			.sort()
	).toEqual(['in_app', 'push', 'sms']);
	expect(rows.filter((r) => r.reference_id === refs[1]).map((r) => r.channel)).toEqual(['in_app']);
});

it('rejects unknown types and duplicate batches without changing saved preferences', async () => {
	const api = (await as(caregiver)).notification,
		before = await stored(caregiver);
	await expect(
		api.updatePreferences({
			preferences: [{ notificationType: 'made_up', pushEnabled: false }]
		} as never)
	).rejects.toMatchObject({ code: 'BAD_REQUEST' });
	await expect(
		api.updatePreferences({
			preferences: [
				{ notificationType: 'note_approved', pushEnabled: false },
				{ notificationType: 'note_approved', pushEnabled: true }
			]
		})
	).rejects.toMatchObject({ code: 'BAD_REQUEST' });
	expect(await stored(caregiver)).toEqual(before);
});

it('keeps read receipts and delivery preferences out of the offline write allowlist', async () => {
	const api = await as(caregiver);
	const result = await api.sync.upload({
		transactionId: 90,
		ops: [
			{
				op: 'PATCH',
				table: 'notifications',
				id: ids[2],
				data: { read_at: new Date().toISOString(), profile_id: caregiver }
			},
			{
				op: 'PUT',
				table: 'notification_preferences',
				id: randomUUID(),
				data: { profile_id: admin, notification_type: 'health_alert', push_enabled: false }
			}
		]
	});
	expect(result.applied).toEqual([]);
	expect(result.rejected.map((r) => r.code)).toEqual([
		'NOT_ALLOWED_OFFLINE',
		'NOT_ALLOWED_OFFLINE'
	]);
});
