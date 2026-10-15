// Production delivery drivers (notifications.md §5-7). Each is selected by an
// environment variable in index.ts; nothing here is used locally unless asked.
// Messages are PHI-free templates (templates.ts); errors are reported by code
// only, never with addresses, tokens or message text.
import {
	PinpointSMSVoiceV2Client,
	SendTextMessageCommand
} from '@aws-sdk/client-pinpoint-sms-voice-v2';
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { awsCredentials, awsRegion } from './aws.ts';
import type { Delivery, SendResult } from './index.ts';

const appUrl = () => process.env.APP_URL ?? 'http://localhost:5173';

// ─── Push: Firebase Cloud Messaging (web push) ──────────────────────────────

/** FCM error codes meaning the token will never work again. */
const DEAD_TOKEN = new Set([
	'messaging/registration-token-not-registered',
	'messaging/invalid-registration-token',
	'messaging/invalid-argument'
]);

export async function pushViaFcm(tokens: string[], d: Delivery): Promise<SendResult> {
	const app = getApps()[0] ?? initializeApp();
	const res = await getMessaging(app).sendEachForMulticast({
		tokens,
		// Generic text only: lock screens are visible to anyone nearby.
		webpush: {
			notification: { title: d.title, body: d.body, icon: '/icons/icon-192.png' },
			fcmOptions: { link: `${appUrl()}${d.link}` }
		},
		data: { notificationId: d.notificationId }
	});
	const deadTokens = res.responses.flatMap((r, i) =>
		!r.success && r.error && DEAD_TOKEN.has(r.error.code) ? [tokens[i]] : []
	);
	const ok = res.responses.find((r) => r.success);
	if (!ok) {
		const err = new Error(`push failed on all ${tokens.length} devices`) as Error & {
			deadTokens?: string[];
		};
		err.deadTokens = deadTokens;
		throw err;
	}
	return { providerMessageId: ok.messageId ?? `fcm-${d.notificationId}`, deadTokens };
}

// ─── Email: Amazon SES ──────────────────────────────────────────────────────

let ses: SESv2Client | undefined;

export async function emailViaSes(to: string, d: Delivery): Promise<SendResult> {
	ses ??= new SESv2Client({ region: awsRegion(), credentials: awsCredentials() });
	const res = await ses.send(
		new SendEmailCommand({
			FromEmailAddress: process.env.SES_FROM_ADDRESS ?? 'Guad <no-reply@guad.app>',
			Destination: { ToAddresses: [to] },
			// Bounces and complaints come back through this set (ses-events webhook).
			ConfigurationSetName: process.env.SES_CONFIGURATION_SET,
			Content: {
				Simple: {
					Subject: { Data: `Guad: ${d.title}` },
					Body: { Text: { Data: `${d.body}\n\n${appUrl()}${d.link}` } }
				}
			}
		})
	);
	if (!res.MessageId) throw new Error('SES returned no message ID');
	return { providerMessageId: res.MessageId };
}

// ─── SMS: AWS End User Messaging ────────────────────────────────────────────

let sms: PinpointSMSVoiceV2Client | undefined;

export async function smsViaAws(phone: string, d: Delivery): Promise<SendResult> {
	sms ??= new PinpointSMSVoiceV2Client({ region: awsRegion(), credentials: awsCredentials() });
	const origination = process.env.SMS_ORIGINATION_IDENTITY;
	if (!origination) throw new Error('SMS_ORIGINATION_IDENTITY is not set');
	const res = await sms.send(
		new SendTextMessageCommand({
			DestinationPhoneNumber: phone,
			OriginationIdentity: origination,
			MessageBody: d.body.slice(0, 160),
			MessageType: 'TRANSACTIONAL',
			// Delivery events come back through this set (sms-events webhook).
			ConfigurationSetName: process.env.SMS_CONFIGURATION_SET
		})
	);
	if (!res.MessageId) throw new Error('SMS service returned no message ID');
	return { providerMessageId: res.MessageId };
}
