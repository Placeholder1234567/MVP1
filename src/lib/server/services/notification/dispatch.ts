// Sends pending notification deliveries (notifications.md §3-7). Idempotent:
// only rows still 'pending' are sent, so a retried or duplicate task never
// sends twice once a row is marked sent.
//
// Each channel has its own Cloud Tasks queue (notifications-push / -sms /
// -email), so SMS keeps to 1 message a second and its own retry policy. A
// provider error is retried by Cloud Tasks; a delivery that can never work
// (no phone, opted out, no device, deactivated) fails at once. On the last
// attempt a failure is final: the row is marked failed and `notification.dead`
// is logged for alerting (notifications.md §3, §11).
import { smsCarrierOverrideAllowed, smsCarrierSuppressed } from './carrier-consent';
import {
	canSendNow,
	localTime,
	notificationOverrides,
	notificationDisabled,
	overDailyLimit,
	type Channel
} from '../../../domain/index.ts';
import { withService } from '../../db';
import { enqueue } from '../../jobs/queue.ts';
import { providers } from '../../messaging/index.ts';
import { render } from '../../messaging/templates.ts';
import { deleteDeviceTokens, isSuppressed } from './events.queries';
import {
	claimDelivery,
	markDelivery,
	pendingDeliveries,
	releaseDelivery,
	pushTokens,
	sentSince,
	stalePending
} from './notification.queries';
import { queuePushSmsFallback } from './push-fallback';
import { queueSmsPushFallback } from './sms-fallback';

/** A delivery that will never succeed, so retrying is pointless. */
class Undeliverable extends Error {
	name = 'Undeliverable';
}

/** Retry later: Cloud Tasks backs off and calls the handler again. */
/** How long a claimed delivery stays with its dispatch (sends take seconds). */
const CLAIM_LEASE_MS = 2 * 60_000;

export class RetryLater extends Error {
	name = 'RetryLater';
}

export interface DispatchContext {
	/** False while Cloud Tasks will still retry this task. */
	final: boolean;
}

export async function dispatchNotifications(
	payload: { ids?: string[] },
	ctx: DispatchContext = { final: true }
): Promise<{
	sent: number;
	held: number;
	failed: number;
	suppressed: number;
	rateLimited: number;
	/** Being sent by another dispatch at the same time */
	skipped: number;
}> {
	const stats = { sent: 0, held: 0, failed: 0, suppressed: 0, rateLimited: 0, skipped: 0 };
	let retry = 0;
	const rows = await withService((tx) => pendingDeliveries(tx, payload.ids));
	const send = providers();
	for (const row of rows) {
		const channel = row.channel as Channel;
		const now = localTime(new Date(), row.timeZone);
		const overrides = notificationOverrides(row.agencySettings);
		if (notificationDisabled(row.type, overrides)) {
			await withService((tx) =>
				markDelivery(tx, row.id, { status: 'failed', evidence: 'suppressed' })
			);
			stats.suppressed++;
			continue;
		}
		const window =
			overrides.quietHours ??
			(row.quietStart && row.quietEnd ? { start: row.quietStart, end: row.quietEnd } : undefined);
		// Held for quiet hours: stays pending, and the sweeper sends it later.
		if (!canSendNow(channel, row.priority, `${now.hour}:${now.minute}`, window)) {
			stats.held++;
			continue;
		}
		// Daily per-person limits (notifications.md §10): over the limit the row
		// is marked rate_limited and not sent; an SMS falls back to push.
		const lastDay = await withService((tx) =>
			sentSince(tx, row.profileId, channel, new Date(Date.now() - 24 * 3_600_000))
		);
		if (overDailyLimit(channel, row.priority, lastDay)) {
			console.log(`notification ${row.id} ${channel} rate limited`);
			await withService(async (tx) => {
				await markDelivery(tx, row.id, { status: 'rate_limited', evidence: 'rate_limited' });
				if (channel === 'sms') await queueSmsPushFallback(tx, row.agencyId, row.id);
			});
			stats.rateLimited++;
			continue;
		}
		// Bounced or complained addresses are never mailed again (notifications.md §7).
		if (
			channel === 'email' &&
			(await withService((tx) => isSuppressed(tx, row.agencyId, row.email.toLowerCase())))
		) {
			console.log(`notification ${row.id} email skipped: address suppressed`);
			await withService((tx) =>
				markDelivery(tx, row.id, { status: 'failed', evidence: 'suppressed' })
			);
			stats.suppressed++;
			continue;
		}
		// Another dispatch is sending this row right now: leave it to that one.
		if (!(await withService((tx) => claimDelivery(tx, row.id, CLAIM_LEASE_MS)))) {
			stats.skipped++;
			continue;
		}
		try {
			if (!row.active) throw new Undeliverable('recipient deactivated');
			const d = render(channel, row);
			let result;
			if (channel === 'push') {
				const tokens = (await withService((tx) => pushTokens(tx, row.profileId))).map(
					(t) => t.token
				);
				if (!tokens.length) throw new Undeliverable('no push device registered');
				try {
					result = await send.push(tokens, d);
				} catch (e) {
					const dead = (e as { deadTokens?: string[] }).deadTokens;
					await removeDeadTokens(row.profileId, dead);
					// Every device was rejected for good: nothing left to retry.
					if (dead?.length === tokens.length) throw new Undeliverable('all push tokens dead');
					throw e;
				}
				await removeDeadTokens(row.profileId, result.deadTokens);
			} else if (channel === 'sms') {
				if (!row.phone) throw new Undeliverable('no phone number');
				if (await withService((tx) => smsCarrierSuppressed(tx, row.agencyId, row.phone!)))
					throw new Undeliverable('carrier SMS opt-out');
				// Texted STOP: carriers block it anyway, and opted-out numbers must not be texted.
				if (
					row.smsEnabled === false &&
					!(
						overrides.forceSmsTypes.some((type) => type === row.type) &&
						(await withService((tx) =>
							smsCarrierOverrideAllowed(tx, row.agencyId, row.profileId, row.phone!)
						))
					)
				)
					throw new Undeliverable('opted out of SMS');
				result = await send.sms(row.phone, d);
			} else {
				result = await send.email(row.email, d);
			}
			await withService((tx) =>
				markDelivery(tx, row.id, {
					status: 'sent',
					providerMessageId: result.providerMessageId,
					evidence: 'provider_accepted'
				})
			);
			stats.sent++;
		} catch (e) {
			// The reason is logged by name only; addresses and tokens are never logged.
			if (!(e instanceof Undeliverable) && !ctx.final) {
				console.warn(`notification ${row.id} ${channel} will retry: ${(e as Error).name}`);
				await withService((tx) => releaseDelivery(tx, row.id));
				retry++;
				continue;
			}
			console.error(`notification.dead ${row.id} ${channel}: ${(e as Error).name}`);
			await withService(async (tx) => {
				await markDelivery(tx, row.id, { status: 'failed', evidence: 'failed' });
				if (channel === 'sms') await queueSmsPushFallback(tx, row.agencyId, row.id);
				// Mandatory alerts reach someone with no push device by text (§5).
				if (channel === 'push') await queuePushSmsFallback(tx, row.agencyId, row.id);
			});
			stats.failed++;
		}
	}
	// Rows left pending get the next attempt; sent ones are skipped then.
	if (retry) throw new RetryLater(`${retry} deliveries will be retried`);
	return stats;
}

/** Forgets push tokens the provider rejected for good (app removed, token expired). */
async function removeDeadTokens(profileId: string, tokens: string[] | undefined) {
	if (tokens?.length) await withService((tx) => deleteDeviceTokens(tx, profileId, tokens));
}

/** Queues deliveries on their channel's queue. */
export async function queueDeliveries(rows: { id: string; channel: string }[]) {
	const byChannel = new Map<string, string[]>();
	for (const r of rows) {
		if (r.channel === 'in_app') continue;
		byChannel.set(r.channel, [...(byChannel.get(r.channel) ?? []), r.id]);
	}
	for (const [channel, ids] of byChannel) {
		for (let i = 0; i < ids.length; i += 500) {
			await enqueue(`notifications-${channel}`, { ids: ids.slice(i, i + 500) });
		}
	}
}

/**
 * Safety net (Cloud Scheduler, every 5 minutes): re-queues deliveries still
 * pending after 3 minutes (longer than any queue's retry backoff), e.g. a
 * dispatch that crashed, or rows held for quiet hours, which go out once the
 * window ends.
 */
export async function sweepNotifications(): Promise<{ queued: number }> {
	const rows = await withService((tx) => stalePending(tx, new Date(Date.now() - 3 * 60_000)));
	await queueDeliveries(rows);
	return { queued: rows.length };
}
