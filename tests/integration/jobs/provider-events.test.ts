import { createSign, generateKeyPairSync, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, withService } from '../../../src/lib/server/db';
import * as s from '../../../src/lib/server/db/schema';
import { dispatchNotifications } from '../../../src/lib/server/services/notification';
import { setProvidersForTests } from '../../../src/lib/server/messaging';
import { canonicalString, type SnsMessage } from '../../../src/lib/server/messaging/sns';
import { POST } from '../../../src/routes/api/webhooks/aws/[topic]/+server';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
const agency = randomUUID();
const profile = randomUUID();
const address = `synthetic-${profile}@example.test`;
const email = vi.fn(async () => ({ providerMessageId: 'unused' }));
const push = vi.fn(async (tokens: string[]) => ({
	providerMessageId: 'push-1',
	deadTokens: tokens.filter((t) => t.startsWith('dead-'))
}));

// A stand-in for the SNS signing certificate, served by a stubbed fetch.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const certUrl = 'https://sns.us-east-1.amazonaws.com/SimpleNotificationService-test.pem';
const sesTopic = 'arn:aws:sns:us-east-1:000000000000:guad-ses-events';
const smsTopic = 'arn:aws:sns:us-east-1:000000000000:guad-sms-events';

function sns(topic: string, event: unknown): SnsMessage {
	const m = {
		Type: 'Notification',
		MessageId: randomUUID(),
		TopicArn: topic,
		Message: JSON.stringify(event),
		Timestamp: new Date().toISOString(),
		SignatureVersion: '2',
		SigningCertURL: certUrl,
		Signature: ''
	} as SnsMessage;
	m.Signature = createSign('RSA-SHA256').update(canonicalString(m)).sign(privateKey, 'base64');
	return m;
}

async function post(topic: string, body: unknown) {
	const request = new Request(`http://worker.test/api/webhooks/aws/${topic}`, {
		method: 'POST',
		headers: { 'content-type': 'text/plain' },
		body: JSON.stringify(body)
	});
	try {
		const res = await POST({ params: { topic }, request } as never);
		return { status: res.status, body: await res.json() };
	} catch (e) {
		return { status: (e as { status: number }).status, body: null };
	}
}

async function delivery(channel: 'email' | 'sms', providerMessageId: string | null) {
	const id = randomUUID();
	await withService((tx) =>
		tx.insert(s.notifications).values({
			id,
			agency_id: agency,
			profile_id: profile,
			type: 'daily_summary',
			title: 'Daily summary',
			channel,
			status: providerMessageId ? 'sent' : 'pending',
			provider_message_id: providerMessageId,
			priority: 3
		})
	);
	return id;
}

const statusOf = async (id: string) =>
	(
		await withService((tx) =>
			tx
				.select({ status: s.notifications.status })
				.from(s.notifications)
				.where(eq(s.notifications.id, id))
		)
	)[0]?.status;

beforeAll(async () => {
	vi.stubEnv('GUAD_SERVICE', 'worker');
	vi.stubEnv('SES_EVENTS_TOPIC_ARN', sesTopic);
	vi.stubEnv('SMS_EVENTS_TOPIC_ARN', smsTopic);
	const realFetch = globalThis.fetch;
	vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) =>
		String(url) === certUrl
			? new Response(publicKey.export({ type: 'spki', format: 'pem' }).toString())
			: realFetch(url, init)
	);
	setProvidersForTests({ email, push });
	await withService(async (tx) => {
		await tx.insert(s.agencies).values({
			id: agency,
			name: 'Events Test',
			slug: `events-${agency}`,
			timezone: 'UTC'
		});
		await tx.insert(s.profiles).values({
			id: profile,
			agency_id: agency,
			auth_uid: `events-${profile}`,
			email: address.toUpperCase(),
			name: 'Synthetic Supervisor',
			role: 'supervisor'
		});
		await tx.insert(s.notificationPreferences).values({
			agency_id: agency,
			profile_id: profile,
			notification_type: 'daily_summary',
			push_enabled: true,
			sms_enabled: false,
			email_enabled: true
		});
	});
});

afterAll(async () => {
	setProvidersForTests(undefined);
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	await closeDb();
});

it('rejects forged, unsigned and wrong-topic webhook calls', async () => {
	const forged = sns(sesTopic, { eventType: 'Bounce' });
	forged.Message = JSON.stringify({ eventType: 'Complaint' });
	expect((await post('ses-events', forged)).status).toBe(403);
	expect((await post('ses-events', { Type: 'Notification', TopicArn: sesTopic })).status).toBe(403);
	expect((await post('ses-events', sns(smsTopic, {}))).status).toBe(403);
	expect((await post('other-events', sns(sesTopic, {}))).status).toBe(404);
});

it('a hard bounce suppresses the address, disables email and is never mailed again', async () => {
	const sesId = `ses-${randomUUID()}`;
	const bounced = await delivery('email', sesId);
	// Transient bounces change nothing.
	const soft = await post(
		'ses-events',
		sns(sesTopic, {
			eventType: 'Bounce',
			mail: { messageId: sesId },
			bounce: { bounceType: 'Transient', bouncedRecipients: [{ emailAddress: address }] }
		})
	);
	expect(soft.body.outcome).toBe('ignored');

	const hard = await post(
		'ses-events',
		sns(sesTopic, {
			eventType: 'Bounce',
			mail: { messageId: sesId },
			bounce: { bounceType: 'Permanent', bouncedRecipients: [{ emailAddress: address }] }
		})
	);
	expect(hard).toEqual({ status: 200, body: { ok: true, outcome: 'suppressed' } });
	expect(await statusOf(bounced)).toBe('failed');

	const [suppression] = await withService((tx) =>
		tx.select().from(s.emailSuppressions).where(eq(s.emailSuppressions.agency_id, agency))
	);
	expect(suppression).toMatchObject({ email: address, reason: 'hard_bounce' });
	const [pref] = await withService((tx) =>
		tx
			.select({ email: s.notificationPreferences.email_enabled })
			.from(s.notificationPreferences)
			.where(eq(s.notificationPreferences.profile_id, profile))
	);
	expect(pref.email).toBe(false);

	// A later (e.g. mandatory) email to the same address is skipped.
	const next = await delivery('email', null);
	expect(await dispatchNotifications({ ids: [next] })).toMatchObject({ suppressed: 1, sent: 0 });
	expect(email).not.toHaveBeenCalled();
	expect(await statusOf(next)).toBe('failed');
});

it('ignores events for messages Guad did not send', async () => {
	const res = await post(
		'ses-events',
		sns(sesTopic, {
			notificationType: 'Complaint',
			mail: { messageId: `ses-${randomUUID()}` },
			complaint: { complainedRecipients: [{ emailAddress: 'other@example.test' }] }
		})
	);
	expect(res.body.outcome).toBe('ignored');
});

it('SMS delivery receipts update the delivery status', async () => {
	const delivered = `sms-${randomUUID()}`;
	const blocked = `sms-${randomUUID()}`;
	const a = await delivery('sms', delivered);
	const b = await delivery('sms', blocked);
	await withService((tx) =>
		tx.update(s.notifications).set({ status: 'pending' }).where(eq(s.notifications.id, a))
	);
	expect(
		(
			await post(
				'sms-events',
				sns(smsTopic, { eventType: 'TEXT_SUCCESSFUL', messageId: delivered })
			)
		).body.outcome
	).toBe('ignored');
	expect(
		(await post('sms-events', sns(smsTopic, { eventType: 'TEXT_DELIVERED', messageId: delivered })))
			.body.outcome
	).toBe('sent');
	expect(
		(await post('sms-events', sns(smsTopic, { eventType: 'TEXT_BLOCKED', messageId: blocked })))
			.body.outcome
	).toBe('failed');
	expect(await statusOf(a)).toBe('sent');
	expect(await statusOf(b)).toBe('failed');
});

it('push removes tokens the provider rejected for good', async () => {
	await withService((tx) =>
		tx.insert(s.deviceTokens).values(
			['live-', 'dead-'].map((p) => ({
				agency_id: agency,
				profile_id: profile,
				token: `${p}${profile}`,
				platform: 'web'
			}))
		)
	);
	const id = randomUUID();
	await withService((tx) =>
		tx.insert(s.notifications).values({
			id,
			agency_id: agency,
			profile_id: profile,
			type: 'health_alert',
			title: 'Review required',
			channel: 'push',
			priority: 1
		})
	);
	expect(await dispatchNotifications({ ids: [id] })).toMatchObject({ sent: 1 });
	const tokens = await withService((tx) =>
		tx
			.select({ token: s.deviceTokens.token })
			.from(s.deviceTokens)
			.where(and(eq(s.deviceTokens.agency_id, agency), eq(s.deviceTokens.profile_id, profile)))
	);
	expect(tokens.map((t) => t.token)).toEqual([`live-${profile}`]);
});
