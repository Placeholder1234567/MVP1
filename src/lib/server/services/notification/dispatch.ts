// Sends pending notification deliveries (notifications.md §3-7). Idempotent:
// only rows still 'pending' are sent, so a retried or duplicate task never
// sends twice once a row is marked sent.
import { canSendNow, localTime, type Channel } from '../../../domain/index.ts';
import { withService } from '../../db';
import { enqueue } from '../../jobs/queue.ts';
import { providers } from '../../messaging/index.ts';
import { render } from '../../messaging/templates.ts';
import { deleteDeviceTokens, isSuppressed } from './events.queries';
import {
	markDelivery,
	pendingDeliveries,
	pushTokens,
	stalePendingIds
} from './notification.queries';

export async function dispatchNotifications(payload: { ids?: string[] }): Promise<{
	sent: number;
	held: number;
	failed: number;
	suppressed: number;
}> {
	const stats = { sent: 0, held: 0, failed: 0, suppressed: 0 };
	const rows = await withService((tx) => pendingDeliveries(tx, payload.ids));
	const send = providers();
	for (const row of rows) {
		const channel = row.channel as Channel;
		const now = localTime(new Date(), row.timeZone);
		const window =
			row.quietStart && row.quietEnd ? { start: row.quietStart, end: row.quietEnd } : undefined;
		// Held for quiet hours: stays pending, and the sweeper sends it later.
		if (!canSendNow(channel, row.priority, `${now.hour}:${now.minute}`, window)) {
			stats.held++;
			continue;
		}
		// Bounced or complained addresses are never mailed again (notifications.md §7).
		if (
			channel === 'email' &&
			(await withService((tx) => isSuppressed(tx, row.agencyId, row.email.toLowerCase())))
		) {
			console.log(`notification ${row.id} email skipped: address suppressed`);
			await withService((tx) => markDelivery(tx, row.id, { status: 'failed' }));
			stats.suppressed++;
			continue;
		}
		try {
			if (!row.active) throw new Error('recipient deactivated');
			const d = render(channel, row);
			let result;
			if (channel === 'push') {
				const tokens = (await withService((tx) => pushTokens(tx, row.profileId))).map(
					(t) => t.token
				);
				if (!tokens.length) throw new Error('no push device registered');
				try {
					result = await send.push(tokens, d);
				} catch (e) {
					await removeDeadTokens(row.profileId, (e as { deadTokens?: string[] }).deadTokens);
					throw e;
				}
				await removeDeadTokens(row.profileId, result.deadTokens);
			} else if (channel === 'sms') {
				if (!row.phone) throw new Error('no phone number');
				// Texted STOP: carriers block it anyway, and opted-out numbers must not be texted.
				if (row.smsEnabled === false) throw new Error('opted out of SMS');
				result = await send.sms(row.phone, d);
			} else {
				result = await send.email(row.email, d);
			}
			await withService((tx) =>
				markDelivery(tx, row.id, { status: 'sent', providerMessageId: result.providerMessageId })
			);
			stats.sent++;
		} catch (e) {
			// The reason is logged by name only; addresses and tokens are never logged.
			console.error(`notification ${row.id} ${channel} failed: ${(e as Error).name}`);
			await withService((tx) => markDelivery(tx, row.id, { status: 'failed' }));
			stats.failed++;
		}
	}
	return stats;
}

/** Forgets push tokens the provider rejected for good (app removed, token expired). */
async function removeDeadTokens(profileId: string, tokens: string[] | undefined) {
	if (tokens?.length) await withService((tx) => deleteDeviceTokens(tx, profileId, tokens));
}

/**
 * Safety net (Cloud Scheduler, every 5 minutes): re-queues deliveries still
 * pending after a minute, e.g. a dispatch that crashed or rows held for quiet
 * hours, which go out once the window ends.
 */
export async function sweepNotifications(): Promise<{ queued: number }> {
	const ids = await withService((tx) => stalePendingIds(tx, new Date(Date.now() - 60_000)));
	if (ids.length) await enqueue('notifications-dispatch', { ids });
	return { queued: ids.length };
}
