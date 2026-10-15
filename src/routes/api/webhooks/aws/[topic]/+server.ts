import { error, json } from '@sveltejs/kit';
import { confirmSubscription, verifySnsMessage } from '#lib/server/messaging/sns.ts';
import { handleEmailEvent, handleSmsEvent } from '#lib/server/services/notification/index.ts';
import { handleInboundSms } from '#lib/server/services/sms/index.ts';
import type { RequestHandler } from './$types';

/**
 * AWS provider events delivered by SNS HTTPS subscriptions, on the worker
 * service only (notifications.md §6-7):
 *   /api/webhooks/aws/ses-events  SES bounces and complaints (SES_EVENTS_TOPIC_ARN)
 *   /api/webhooks/aws/sms-events  SMS delivery receipts      (SMS_EVENTS_TOPIC_ARN)
 *   /api/webhooks/aws/sms-inbound texts staff send us        (SMS_INBOUND_TOPIC_ARN)
 * Unsigned, forged or wrong-topic messages get 403. A 2xx tells SNS the
 * message was handled; anything else makes it retry.
 */
const TOPICS: Record<string, { env: string; handle: (event: never) => Promise<string> }> = {
	'ses-events': { env: 'SES_EVENTS_TOPIC_ARN', handle: handleEmailEvent },
	'sms-events': { env: 'SMS_EVENTS_TOPIC_ARN', handle: handleSmsEvent },
	'sms-inbound': { env: 'SMS_INBOUND_TOPIC_ARN', handle: handleInboundSms }
};

export const POST: RequestHandler = async ({ params, request }) => {
	if (process.env.GUAD_SERVICE !== 'worker') error(404, 'Not found');
	const topic = TOPICS[params.topic];
	if (!topic) error(404, 'Not found');

	// SNS posts JSON with Content-Type text/plain.
	const body = await request
		.text()
		.then((t) => JSON.parse(t) as unknown)
		.catch(() => null);
	const message = await verifySnsMessage(body, process.env[topic.env]);
	if (!message) error(403, 'Not a verified SNS message');

	if (message.Type === 'SubscriptionConfirmation') {
		await confirmSubscription(message);
		return json({ ok: true });
	}
	if (message.Type !== 'Notification') return json({ ok: true });

	let event: unknown;
	try {
		event = JSON.parse(message.Message);
	} catch {
		return json({ ok: true, outcome: 'ignored' });
	}
	const outcome = await topic.handle(event as never);
	return json({ ok: true, outcome });
};
