// Provider events (notifications.md §6-7): SES bounces and complaints, and
// SMS delivery receipts, after the webhook has verified the SNS signature.
// Events are matched to a delivery by the provider message ID stored at send
// time, which also gives the agency. Events for messages Guad didn't send
// through the notifications table are ignored. Logs carry IDs only.
import { withService } from '../../db';
import { queueSmsPushFallback } from './sms-fallback';
import {
	deliveryByProviderId,
	disableEmailFor,
	setDeliveryStatus,
	suppress
} from './events.queries';

interface SesEvent {
	eventType?: string;
	/** SES identity notifications use this name instead of eventType. */
	notificationType?: string;
	mail?: { messageId?: string };
	bounce?: { bounceType?: string; bouncedRecipients?: { emailAddress?: string }[] };
	complaint?: { complainedRecipients?: { emailAddress?: string }[] };
}

export type EventOutcome = 'ignored' | 'suppressed' | 'sent' | 'failed';

export function handleEmailEvent(event: SesEvent): Promise<EventOutcome> {
	const type = event.eventType ?? event.notificationType;
	const messageId = event.mail?.messageId;
	if (!messageId) return Promise.resolve('ignored');
	const recipients =
		type === 'Bounce' && event.bounce?.bounceType === 'Permanent'
			? event.bounce.bouncedRecipients
			: type === 'Complaint'
				? event.complaint?.complainedRecipients
				: undefined;
	// Transient bounces and delivery receipts change nothing: the row is
	// already 'sent', and SES retries soft bounces itself.
	if (!recipients?.length) return Promise.resolve('ignored');
	const reason = type === 'Complaint' ? 'complaint' : 'hard_bounce';
	return withService(async (tx) => {
		const delivery = await deliveryByProviderId(tx, messageId, 'email');
		if (!delivery) return 'ignored';
		for (const r of recipients) {
			const email = r.emailAddress?.trim().toLowerCase();
			if (!email) continue;
			await suppress(tx, delivery.agencyId, email, reason);
			await disableEmailFor(tx, delivery.agencyId, email);
		}
		if (reason === 'hard_bounce') await setDeliveryStatus(tx, delivery.id, 'failed');
		console.log(`email ${reason} for notification ${delivery.id}`);
		return 'suppressed';
	});
}

interface SmsEvent {
	eventType?: string;
	messageId?: string;
}

/** Still in flight; the final event comes later. */
const SMS_IN_FLIGHT = new Set(['TEXT_PENDING', 'TEXT_QUEUED', 'TEXT_SUCCESSFUL']);

export function handleSmsEvent(event: SmsEvent): Promise<EventOutcome> {
	const { eventType, messageId } = event;
	if (!eventType || !messageId || SMS_IN_FLIGHT.has(eventType)) {
		return Promise.resolve('ignored');
	}
	const status = eventType === 'TEXT_DELIVERED' ? 'sent' : 'failed';
	return withService(async (tx) => {
		const delivery = await deliveryByProviderId(tx, messageId, 'sms');
		// Read receipts and escalations are further along; leave them alone.
		if (!delivery || !['pending', 'sent'].includes(delivery.status)) return 'ignored';
		await setDeliveryStatus(tx, delivery.id, status);
		if (status === 'failed') await queueSmsPushFallback(tx, delivery.agencyId, delivery.id);
		if (status === 'failed') console.log(`sms ${eventType} for notification ${delivery.id}`);
		return status;
	});
}
