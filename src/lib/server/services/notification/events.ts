// Provider events (notifications.md §6-7): SES bounces and complaints, and
// SMS delivery receipts, after the webhook has verified the SNS signature.
// Events are matched to a delivery by the provider message ID stored at send
// time, which also gives the agency. Events for messages Guad didn't send
// through the notifications table are ignored. Logs carry IDs only.
import { withService, type Tx } from '../../db';
import { notify, type Recipient } from './index';
import { queueSmsPushFallback } from './sms-fallback';
import {
	deliveryByProviderId,
	disableEmailFor,
	recordSoftBounce,
	setDeliveryStatus,
	softBouncesSince,
	staffWithEmail,
	suppress
} from './events.queries';
import { activeStaffByRole, recordCoverageOfferEvidence } from './notification.queries';

interface SesEvent {
	eventType?: string;
	/** SES identity notifications use this name instead of eventType. */
	notificationType?: string;
	mail?: { messageId?: string };
	bounce?: { bounceType?: string; bouncedRecipients?: { emailAddress?: string }[] };
	complaint?: { complainedRecipients?: { emailAddress?: string }[] };
}

export type EventOutcome = 'ignored' | 'suppressed' | 'sent' | 'failed';

/** notifications.md §7: this many soft bounces in 24 hours count as a hard bounce. */
export const SOFT_BOUNCE_LIMIT = 3;

export function handleEmailEvent(event: SesEvent): Promise<EventOutcome> {
	const type = event.eventType ?? event.notificationType;
	const messageId = event.mail?.messageId;
	if (!messageId) return Promise.resolve('ignored');
	const bounceType = event.bounce?.bounceType;
	const recipients =
		type === 'Bounce'
			? event.bounce?.bouncedRecipients
			: type === 'Complaint'
				? event.complaint?.complainedRecipients
				: undefined;
	if (type === 'Delivery') {
		return withService(async (tx) => {
			const delivery = await deliveryByProviderId(tx, messageId, 'email');
			if (!delivery || !['pending', 'sent'].includes(delivery.status)) return 'ignored';
			await recordCoverageOfferEvidence(tx, delivery.id, 'delivery_reported');
			return 'sent';
		});
	}
	if (!recipients?.length) return Promise.resolve('ignored');
	return withService(async (tx) => {
		const delivery = await deliveryByProviderId(tx, messageId, 'email');
		if (!delivery) return 'ignored';
		let suppressed = false;
		for (const r of recipients) {
			const email = r.emailAddress?.trim().toLowerCase();
			if (!email) continue;
			let reason: 'complaint' | 'hard_bounce' | 'soft_bounce_limit';
			if (type === 'Complaint') reason = 'complaint';
			else if (bounceType === 'Permanent') reason = 'hard_bounce';
			else {
				// Count distinct deliveries, not retries of the same provider callback.
				if (!(await recordSoftBounce(tx, delivery.agencyId, email, delivery.id))) continue;
				const since = new Date(Date.now() - 24 * 3600_000);
				if ((await softBouncesSince(tx, delivery.agencyId, email, since)) < SOFT_BOUNCE_LIMIT)
					continue;
				reason = 'soft_bounce_limit';
			}
			await suppress(tx, delivery.agencyId, email, reason);
			await disableEmailFor(tx, delivery.agencyId, email);
			await alertAdmins(tx, delivery.agencyId, email, reason);
			suppressed = true;
		}
		if (!suppressed) return 'ignored';
		if (type === 'Bounce') {
			await setDeliveryStatus(tx, delivery.id, 'failed');
			await recordCoverageOfferEvidence(tx, delivery.id, 'failed');
		} else await recordCoverageOfferEvidence(tx, delivery.id, 'suppressed');
		console.log(`email suppression for notification ${delivery.id}`);
		return 'suppressed';
	});
}

/**
 * notifications.md §7: tell the agency's admins a staff address no longer
 * gets Guad email, so they can fix it and lift the suppression. The text
 * names no one; the alert links to the staff member's record.
 */
async function alertAdmins(
	tx: Tx,
	agencyId: string,
	email: string,
	reason: 'complaint' | 'hard_bounce' | 'soft_bounce_limit'
) {
	const admins = await activeStaffByRole(tx, agencyId, 'admin');
	if (!admins.length) return;
	const staff = await staffWithEmail(tx, agencyId, email);
	await notify(tx, agencyId, admins as Recipient[], {
		type: 'email_delivery_problem',
		priority: 3,
		title:
			reason === 'complaint'
				? 'A staff member marked Guad email as spam'
				: 'Email to a staff member keeps bouncing',
		body: 'Guad has stopped emailing this address. Check it in Staff, then ask support to lift the block.',
		referenceId: staff?.id,
		referenceType: staff ? 'profiles' : undefined
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
		await recordCoverageOfferEvidence(
			tx,
			delivery.id,
			status === 'sent' ? 'delivery_reported' : 'failed'
		);
		if (status === 'failed') await queueSmsPushFallback(tx, delivery.agencyId, delivery.id);
		if (status === 'failed') console.log(`sms ${eventType} for notification ${delivery.id}`);
		return status;
	});
}
