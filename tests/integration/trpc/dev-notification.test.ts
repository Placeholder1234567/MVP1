import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, withService } from '../../../src/lib/server/db';
import * as s from '../../../src/lib/server/db/schema';
import { getCurrentUser } from '../../../src/lib/server/services/auth';
import { setProvidersForTests } from '../../../src/lib/server/messaging';
import { devNotificationRouter } from '../../../src/lib/server/trpc/routers/dev-notification';
import { createCallerFactory } from '../../../src/lib/server/trpc/middleware';
import { enqueue, cancel, localNotificationTasks } from '../../../src/lib/server/jobs/queue';

const agency = randomUUID(),
	other = randomUUID(),
	admin = randomUUID(),
	peer = randomUUID(),
	staff = randomUUID(),
	stranger = randomUUID();
const uid = (id: string) => `dev-panel-${id}`;
const caller = createCallerFactory(devNotificationRouter);
const as = async (id: string) => caller({ user: await getCurrentUser(uid(id)), request: {} });
const sent = vi.fn(async () => ({ providerMessageId: 'must-not-send' }));
beforeAll(async () => {
	vi.stubEnv('GOOGLE_CLOUD_PROJECT', 'demo-guad');
	vi.stubEnv('FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9099');
	vi.stubEnv('JOBS_DRIVER', 'local');
	vi.stubEnv('PUSH_DRIVER', 'console');
	vi.stubEnv('SMS_DRIVER', 'console');
	vi.stubEnv('EMAIL_DRIVER', 'smtp');
	vi.stubEnv('SMTP_URL', '');
	vi.stubEnv('CLOUD_SQL_INSTANCE', '');
	setProvidersForTests({ push: sent, sms: sent, email: sent });
	await withService(async (tx) => {
		await tx.insert(s.agencies).values(
			[agency, other].map((id) => ({
				id,
				name: 'Synthetic panel',
				slug: uid(id),
				subscription_tier: 'complete' as const
			}))
		);
		await tx.insert(s.profiles).values(
			[
				{ id: admin, agency_id: agency, role: 'admin' as const },
				{ id: peer, agency_id: agency, role: 'admin' as const },
				{ id: staff, agency_id: agency, role: 'caregiver' as const },
				{ id: stranger, agency_id: other, role: 'admin' as const }
			].map((p) => ({
				...p,
				auth_uid: uid(p.id),
				name: 'Synthetic Staff',
				email: `${p.id}@example.test`
			}))
		);
		await tx.insert(s.notifications).values(
			[admin, peer, stranger].map((profile_id) => ({
				id: profile_id,
				agency_id: profile_id === stranger ? other : agency,
				profile_id,
				type: 'health_alert',
				channel: 'in_app',
				status: 'sent' as const,
				title: 'Synthetic history'
			}))
		);
	});
});
afterAll(async () => {
	setProvidersForTests(undefined);
	vi.unstubAllEnvs();
	await closeDb();
});
it('requires an admin and limits history and preview recipients to the caller', async () => {
	await expect((await as(staff)).recent()).rejects.toMatchObject({ code: 'FORBIDDEN' });
	await expect(caller({ user: null, request: {} }).recent()).rejects.toMatchObject({
		code: 'UNAUTHORIZED'
	});
	const me = await as(admin);
	expect((await me.recent()).map((row) => row.id)).toEqual([admin]);
	const previews = await me.preview({ type: 'health_alert' });
	expect(previews.length).toBeGreaterThan(0);
	expect(previews.every((item) => item.profileId === admin)).toBe(true);
	expect(sent).not.toHaveBeenCalled();
	expect(
		await withService((tx) =>
			tx.select().from(s.notifications).where(eq(s.notifications.agency_id, agency))
		)
	).toHaveLength(2);
	await expect(
		me.preview({ type: 'health_alert', profileId: stranger } as never)
	).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});
it('scopes agency history to the caller agency and requires explicit confirmation for fixed test content', async () => {
	const me = await as(admin);
	expect((await me.recent({ scope: 'agency' })).map((row) => row.id).sort()).toEqual(
		[admin, peer].sort()
	);
	expect((await me.recent({ scope: 'mine' })).map((row) => row.id)).toEqual([admin]);
	await expect(
		(await as(staff)).sendTest({ type: 'daily_summary', confirm: true })
	).rejects.toMatchObject({ code: 'FORBIDDEN' });
	await expect(
		me.sendTest({ type: 'daily_summary', confirm: false } as never)
	).rejects.toMatchObject({ code: 'BAD_REQUEST' });
	await expect(
		me.sendTest({ type: 'daily_summary', confirm: true, profileId: stranger } as never)
	).rejects.toMatchObject({ code: 'BAD_REQUEST' });
	await expect(me.recent({ scope: 'agency', agencyId: other } as never)).rejects.toMatchObject({
		code: 'BAD_REQUEST'
	});
	await me.sendTest({ type: 'daily_summary', confirm: true });
	const history = await me.recent();
	const tests = history.filter((row) => row.title === 'Synthetic development notification');
	expect(tests.length).toBeGreaterThan(0);
	expect(
		tests.every(
			(row) =>
				row.profileId === admin &&
				row.type === 'daily_summary' &&
				row.body === 'Synthetic test delivery. No care record is referenced.'
		)
	).toBe(true);
	await vi.waitFor(() => expect(sent).toHaveBeenCalled());
});
it('lists and fires only synthetic escalation events from the current agency', async () => {
	const me = await as(admin);
	await me.sendTest({ type: 'health_alert', confirm: true });
	await (await as(stranger)).sendTest({ type: 'health_alert', confirm: true });
	await enqueue(
		'notifications-escalate',
		{
			agencyId: agency,
			notificationId: admin,
			referenceId: randomUUID(),
			type: 'health_alert',
			step: 1
		},
		{ taskName: 'unmarked-event', delaySeconds: 3600 }
	);
	const tasks = await me.pendingTasks();
	expect(tasks).toHaveLength(1);
	expect(tasks[0]).toMatchObject({ job: 'notifications-escalate', type: 'health_alert', step: 1 });
	expect(tasks[0]).not.toHaveProperty('payload');
	await expect((await as(staff)).pendingTasks()).rejects.toMatchObject({ code: 'FORBIDDEN' });
	await expect(
		(await as(stranger)).fireTask({ id: tasks[0].id, confirm: true })
	).rejects.toMatchObject({ code: 'NOT_FOUND' });
	const unmarked = localNotificationTasks().find(
		(task) => (task.payload as { notificationId?: string }).notificationId === admin
	)!;
	await expect(me.fireTask({ id: unmarked.id, confirm: true })).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
	await expect(me.fireTask({ id: tasks[0].id, confirm: false } as never)).rejects.toMatchObject({
		code: 'BAD_REQUEST'
	});
	expect(await me.fireTask({ id: tasks[0].id, confirm: true })).toEqual({ outcome: 'completed' });
	await expect(me.fireTask({ id: tasks[0].id, confirm: true })).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
	await cancel('notifications-escalate', 'unmarked-event');
});
it('fails closed when real delivery providers or a production runtime are configured', async () => {
	const me = await as(admin);
	vi.stubEnv('SMS_DRIVER', 'aws');
	await expect(me.preview({ type: 'health_alert' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
	await expect(me.sendTest({ type: 'health_alert', confirm: true })).rejects.toMatchObject({
		code: 'NOT_FOUND'
	});
	vi.stubEnv('SMS_DRIVER', 'console');
	vi.stubEnv('NODE_ENV', 'production');
	await expect(me.recent()).rejects.toMatchObject({ code: 'NOT_FOUND' });
});
