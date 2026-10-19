import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { closeDb, withService } from '../../../src/lib/server/db';
import * as s from '../../../src/lib/server/db/schema';
import { notify } from '../../../src/lib/server/services/notification';
import { setProvidersForTests } from '../../../src/lib/server/messaging';
process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
const agency = randomUUID(),
	profile = randomUUID();
const email = vi.fn(async () => ({ providerMessageId: 'preview-must-not-send' }));
const push = vi.fn(async () => ({ providerMessageId: 'preview-must-not-send' }));
const sms = vi.fn(async () => ({ providerMessageId: 'preview-must-not-send' }));
beforeAll(async () => {
	setProvidersForTests({ email, push, sms });
	await withService(async (tx) => {
		await tx
			.insert(s.agencies)
			.values({
				id: agency,
				slug: `preview-${agency}`,
				name: 'Synthetic preview',
				settings: {
					notification_overrides: {
						requireSummaryEmail: true,
						disabledTypes: ['shift_reminder'],
						quietHours: null
					}
				}
			});
		await tx
			.insert(s.profiles)
			.values({
				id: profile,
				agency_id: agency,
				auth_uid: `preview-${profile}`,
				name: 'Synthetic',
				email: 'preview@example.test',
				role: 'supervisor'
			});
		await tx
			.insert(s.notificationPreferences)
			.values({
				agency_id: agency,
				profile_id: profile,
				notification_type: 'daily_summary',
				push_enabled: false,
				sms_enabled: false,
				email_enabled: false
			});
	});
});
afterAll(async () => {
	setProvidersForTests(undefined);
	await closeDb();
});
it('previews selected channel templates without notification rows, jobs or provider calls', async () => {
	const result = await withService((tx) =>
		notify(
			tx,
			agency,
			[{ id: profile, role: 'supervisor' }],
			{
				type: 'daily_summary',
				title: 'Daily summary',
				body: 'Notes pending review: 2',
				priority: 4
			},
			{ preview: true }
		)
	);
	expect(result).toHaveLength(1);
	expect(result[0]).toMatchObject({
		profileId: profile,
		channel: 'email',
		delivery: { title: 'Daily summary' }
	});
	expect(result[0].delivery.body).toContain('Notes pending review: 2');
	expect(
		await withService((tx) =>
			tx.select().from(s.notifications).where(eq(s.notifications.agency_id, agency))
		)
	).toEqual([]);
	expect(email).not.toHaveBeenCalled();
	expect(push).not.toHaveBeenCalled();
	expect(sms).not.toHaveBeenCalled();
});
it('applies optional-type disabling and mandatory channel protection to previews', async () => {
	await withService(async (tx) => {
		const recipients = [{ id: profile, role: 'supervisor' as const }];
		expect(
			await notify(
				tx,
				agency,
				recipients,
				{ type: 'shift_reminder', title: 'Reminder', priority: 3 },
				{ preview: true }
			)
		).toEqual([]);
		const result = await notify(
			tx,
			agency,
			recipients,
			{ type: 'health_alert', title: 'Review required', priority: 1 },
			{ preview: true }
		);
		expect(result.map((r) => r.channel)).toEqual(['push']);
		expect(result[0].delivery.body).toBe('Open Guad to see details.');
	});
});
