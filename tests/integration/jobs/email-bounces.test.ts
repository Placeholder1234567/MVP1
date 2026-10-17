// SES bounce handling (notifications.md §7): soft bounces count toward a
// suppression, and admins hear about every address Guad stops emailing.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, withService } from '../../../src/lib/server/db';
import * as s from '../../../src/lib/server/db/schema';
import { handleEmailEvent } from '../../../src/lib/server/services/notification';
import { setProvidersForTests } from '../../../src/lib/server/messaging';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
const agency = randomUUID(),
	admin = randomUUID(),
	staffer = randomUUID(),
	other = randomUUID();
const softAddress = `soft-${staffer}@example.test`;
const spamAddress = `spam-${other}@example.test`;

beforeAll(async () => {
	setProvidersForTests({
		push: async () => ({ providerMessageId: 'push' }),
		email: async () => ({ providerMessageId: 'email' })
	});
	await withService(async (tx) => {
		await tx.insert(s.agencies).values({
			id: agency,
			name: 'Bounce Test',
			slug: `bounce-${agency}`,
			subscription_tier: 'complete'
		});
		await tx.insert(s.profiles).values(
			(
				[
					[admin, 'admin', `admin-${admin}@example.test`],
					[staffer, 'caregiver', softAddress],
					[other, 'caregiver', spamAddress]
				] as const
			).map(([id, role, email]) => ({
				id,
				agency_id: agency,
				auth_uid: `bounce-${id}`,
				email,
				name: 'Synthetic Staff',
				role
			}))
		);
	});
});

afterAll(async () => {
	setProvidersForTests(undefined);
	await closeDb();
});

async function sentEmail() {
	const id = `ses-${randomUUID()}`;
	await withService((tx) =>
		tx.insert(s.notifications).values({
			agency_id: agency,
			profile_id: staffer,
			type: 'daily_summary',
			title: 'Daily summary',
			channel: 'email',
			status: 'sent',
			provider_message_id: id,
			priority: 4
		})
	);
	return id;
}

const softBounce = async (address: string) =>
	handleEmailEvent({
		eventType: 'Bounce',
		mail: { messageId: await sentEmail() },
		bounce: { bounceType: 'Transient', bouncedRecipients: [{ emailAddress: address }] }
	});

const suppressions = () =>
	withService((tx) =>
		tx.select().from(s.emailSuppressions).where(eq(s.emailSuppressions.agency_id, agency))
	);

const adminAlerts = () =>
	withService((tx) =>
		tx
			.select()
			.from(s.notifications)
			.where(
				and(
					eq(s.notifications.agency_id, agency),
					eq(s.notifications.profile_id, admin),
					eq(s.notifications.type, 'email_delivery_problem'),
					eq(s.notifications.channel, 'in_app')
				)
			)
	);

it('suppresses an address after three soft bounces in a day, and tells admins', async () => {
	expect(await softBounce(softAddress)).toBe('ignored');
	expect(await softBounce(softAddress)).toBe('ignored');
	expect(await suppressions()).toEqual([]);
	expect(await softBounce(softAddress)).toBe('suppressed');
	expect(await suppressions()).toEqual([
		expect.objectContaining({ email: softAddress, reason: 'soft_bounce_limit' })
	]);
	const [alert] = await adminAlerts();
	expect(alert).toMatchObject({
		title: 'Email to a staff member keeps bouncing',
		reference_id: staffer,
		reference_type: 'profiles'
	});
	// The alert names no one.
	expect(`${alert.title} ${alert.body}`).not.toContain(softAddress);
});

it('a spam complaint suppresses at once and alerts admins', async () => {
	expect(
		await handleEmailEvent({
			eventType: 'Complaint',
			mail: { messageId: await sentEmail() },
			complaint: { complainedRecipients: [{ emailAddress: spamAddress.toUpperCase() }] }
		})
	).toBe('suppressed');
	expect((await suppressions()).map((r) => [r.email, r.reason])).toContainEqual([
		spamAddress,
		'complaint'
	]);
	expect((await adminAlerts()).map((a) => a.title)).toContain(
		'A staff member marked Guad email as spam'
	);
});
