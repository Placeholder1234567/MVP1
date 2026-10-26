// Daily summary (notifications.md §2.16, §3.5, §7 "Daily Summary Email Layout").
// Every 15 minutes a sweep queues one digest task per agency whose local time
// is 06:00-06:14, named per agency and day so it runs once. The digest sends
// each supervisor (their homes) and admin (all homes) a daily_summary
// notification: email + push by default. The body has counts and home names
// only, never client names or clinical detail.
import { localTime } from '../../../domain/index.ts';
import { withService } from '../../db';
import { forEachIsolated } from '../../jobs/isolate.ts';
import { enqueue } from '../../jobs/queue.ts';
import { agencyClocks, digestCounts, digestRecipients, homeNames } from './escalation.queries';
import { notify } from './index';

/** The local day if the sweep at `now` is the one that sends this agency's digest. */
export function digestDay(now: Date, timeZone: string): string | null {
	const local = localTime(now, timeZone);
	return local.hour === 6 && local.minute < 15 ? local.day : null;
}

export async function sweepDigests(now = new Date()): Promise<{ queued: number }> {
	const agencies = await withService((tx) => agencyClocks(tx));
	let queued = 0;
	await forEachIsolated(
		'digest agency',
		agencies,
		(a) => a.id,
		async (a) => {
			const day = digestDay(now, a.timeZone);
			if (!day) return;
			await enqueue('daily-digest', { agencyId: a.id }, { taskName: `digest-${a.id}-${day}` });
			queued++;
		}
	);
	return { queued };
}

type Counts = Awaited<ReturnType<typeof digestCounts>>;

/** The digest text for one recipient, limited to their homes. */
export function digestBody(counts: Counts, names: Map<string, string>, homeIds: string[] | null) {
	const mine = (rows: { homeId: string | null; n: number }[]) =>
		rows.filter((r) => !homeIds || (r.homeId !== null && homeIds.includes(r.homeId)));
	const total = (rows: { homeId: string | null; n: number }[]) =>
		mine(rows).reduce((sum, r) => sum + Number(r.n), 0);
	const byHome = (rows: { homeId: string | null; n: number }[]) => {
		const parts = mine(rows)
			.filter((r) => r.homeId && Number(r.n) > 0)
			.map((r) => `${names.get(r.homeId!) ?? 'Home'} ${r.n}`)
			.sort();
		return parts.length ? ` (${parts.join(', ')})` : '';
	};
	return [
		`Notes pending review: ${total(counts.pendingNotes)}${byHome(counts.pendingNotes)}`,
		`Open incidents: ${total(counts.openIncidents)}${byHome(counts.openIncidents)}`,
		`Medication refusals in the last day: ${total(counts.refusals)} (${total(counts.unacknowledged)} unacknowledged)`,
		`Coverage: ${total(counts.filled)} filled in the last day, ${total(counts.unfilled)} unfilled`,
		`Clock exceptions in the last day: ${total(counts.clock)}`
	].join('\n');
}

export async function sendDigest(input: { agencyId: string }): Promise<{ sent: number }> {
	const since = new Date(Date.now() - 24 * 3600_000);
	return withService(async (tx) => {
		const counts = await digestCounts(tx, input.agencyId, since);
		const homes = await homeNames(tx, input.agencyId);
		const recipients = await digestRecipients(tx, input.agencyId);
		const names = new Map(homes.map((h) => [h.id, h.name]));
		let sent = 0;
		for (const r of recipients) {
			sent += await notify(tx, input.agencyId, [{ id: r.id, role: r.role }], {
				type: 'daily_summary',
				priority: 4,
				title: 'Daily summary',
				body: digestBody(counts, names, r.role === 'admin' ? null : (r.homeIds ?? []))
			});
		}
		return { sent };
	});
}
