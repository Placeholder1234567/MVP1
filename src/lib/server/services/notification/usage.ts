// Messaging usage on the admin Setup screen (notifications.md "Cost
// Tracking" and "Opt-Out"): this month's deliveries by channel with an
// estimated text cost, and who has texts turned off.
import { calendarDayStart } from '../../../domain/clinical-export';
import { localTime, monthStart, smsCostEstimate } from '../../../domain/index.ts';
import type { Tx } from '../../db';
import { sentByChannel, smsPreferences } from './usage.queries';

export async function messagingUsage(tx: Tx, agencyId: string, timeZone: string, now = new Date()) {
	const month = monthStart(localTime(now, timeZone).day);
	const sent = new Map(
		(await sentByChannel(tx, agencyId, calendarDayStart(month, timeZone))).map((r) => [
			r.channel,
			r.n
		])
	);
	// Off for every type: they replied STOP, or turned texts off themselves.
	const byPerson = new Map<string, { name: string; anyOn: boolean }>();
	for (const p of await smsPreferences(tx, agencyId)) {
		const seen = byPerson.get(p.profileId) ?? { name: p.name, anyOn: false };
		seen.anyOn ||= !!p.smsEnabled;
		byPerson.set(p.profileId, seen);
	}
	const texts = sent.get('sms') ?? 0;
	return {
		month,
		texts,
		emails: sent.get('email') ?? 0,
		pushes: sent.get('push') ?? 0,
		textCost: smsCostEstimate(texts),
		textsOff: [...byPerson]
			.filter(([, p]) => !p.anyOn)
			.map(([id, p]) => ({ id, name: p.name }))
			.sort((a, b) => a.name.localeCompare(b.name))
	};
}
