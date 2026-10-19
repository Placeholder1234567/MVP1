// Messaging usage on the admin Setup screen (notifications.md "Cost
// Tracking" and "Opt-Out"): this month's deliveries by channel with an
// estimated text cost, and who has texts turned off.
import { calendarDayStart } from '../../../domain/clinical-export';
import {
	DEFAULT_CHANNELS,
	localTime,
	monthStart,
	NOTIFICATION_TYPES,
	smsCostEstimate,
	type StaffRole
} from '../../../domain/index.ts';
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
	// Texts off for every type: they replied STOP, or turned texts off
	// themselves. A type with no saved preference follows the role default,
	// so saving one setting doesn't make someone look opted out.
	const people = new Map<string, { name: string; role: StaffRole; saved: Map<string, boolean> }>();
	for (const p of await smsPreferences(tx, agencyId)) {
		const person = people.get(p.profileId) ?? {
			name: p.name,
			role: p.role,
			saved: new Map<string, boolean>()
		};
		person.saved.set(p.type, !!p.smsEnabled);
		people.set(p.profileId, person);
	}
	const textsOff = [...people]
		.filter(([, p]) => {
			const byDefault = NOTIFICATION_TYPES.filter((t) =>
				DEFAULT_CHANNELS[t][p.role].includes('sms')
			);
			const on = NOTIFICATION_TYPES.some(
				(t) => p.saved.get(t) ?? DEFAULT_CHANNELS[t][p.role].includes('sms')
			);
			return byDefault.length > 0 && !on;
		})
		.map(([id, p]) => ({ id, name: p.name }))
		.sort((a, b) => a.name.localeCompare(b.name));
	const texts = sent.get('sms') ?? 0;
	return {
		month,
		texts,
		emails: sent.get('email') ?? 0,
		pushes: sent.get('push') ?? 0,
		textCost: smsCostEstimate(texts),
		textsOff
	};
}
