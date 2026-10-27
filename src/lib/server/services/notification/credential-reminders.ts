// Training and certification reminders (notifications.md §2.22), run by the
// hourly credential-expiry-sweep. From 09:00 in the agency's time zone, each
// active staff member hears about their own credential 30, 14 and 7 days
// before it expires and once it has lapsed; the agency's admins hear once
// while it is expiring and once when it lapses. Each alert's reference is a
// stable ID made from the credential, its expiry date and the stage, so a
// renewed credential (a new date) is reminded about again, and nothing is
// sent twice however often the sweep runs.
//
// From the first run after midnight, someone whose medication
// administration credential has lapsed stops being med-certified
// (profiles.med_certified), so they can't record doses, be offered shifts
// that need it, or witness a controlled count until an admin records the
// renewal.
import { createHash } from 'node:crypto';
import {
	addDays,
	adminReminderKey,
	adminReminderTitle,
	EXPIRING_DAYS,
	localTime,
	ownReminderTitle,
	reminderStage
} from '../../../domain/index.ts';
import { withService, type Tx } from '../../db';
import { forEachIsolated } from '../../jobs/isolate.ts';
import { credentialsExpiring, revokeLapsedMedCertificates } from './credential-reminders.queries';
import { agencyClocks } from './escalation.queries';
import { notify, type Recipient } from './index';
import { alreadySent } from './med-reminders.queries';
import { activeStaffByRole } from './notification.queries';

/** Local hour from which reminders go out, so they don't arrive overnight. */
export const CREDENTIAL_REMINDER_HOUR = 9;

/** How long after a lapse the "expired" reminder may still go out. */
const LAPSED_LOOKBACK_DAYS = 30;

const NAMESPACE = Buffer.from('c3e1a5d07b2f4e8a9d6c1b0f2a4e7d93', 'hex');

/** UUIDv5-style ID for one reminder about one credential's expiry date. */
export function credentialReminderId(credentialId: string, expiresOn: string, key: string) {
	const bytes = createHash('sha1')
		.update(NAMESPACE)
		.update(`${credentialId}|${expiresOn}|${key}`)
		.digest()
		.subarray(0, 16);
	bytes[6] = (bytes[6] & 15) | 0x50;
	bytes[8] = (bytes[8] & 63) | 0x80;
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function sweepCredentialReminders(
	now = new Date()
): Promise<{ sent: number; revoked: number }> {
	const agencies = await withService((tx) => agencyClocks(tx));
	let sent = 0;
	let revoked = 0;
	await forEachIsolated(
		'credential-reminder agency',
		agencies,
		(a) => a.id,
		async (a) => {
			const local = localTime(now, a.timeZone);
			revoked += await withService((tx) => revokeLapsedMedCertificates(tx, a.id, local.day));
			if (local.hour < CREDENTIAL_REMINDER_HOUR) return;
			sent += await withService((tx) => remindCredentials(tx, a.id, local.day));
		}
	);
	return { sent, revoked };
}

export async function remindCredentials(tx: Tx, agencyId: string, today: string): Promise<number> {
	const due = await credentialsExpiring(
		tx,
		agencyId,
		addDays(today, -LAPSED_LOOKBACK_DAYS),
		addDays(today, EXPIRING_DAYS)
	);
	let admins: Recipient[] | null = null;
	let sent = 0;
	for (const c of due) {
		const stage = reminderStage(c.expiresOn, today);
		if (!c.expiresOn || !stage) continue;
		const own = credentialReminderId(c.id, c.expiresOn, `own-${stage}`);
		if (!(await alreadySent(tx, agencyId, 'credential_expiring', own))) {
			await notify(tx, agencyId, [{ id: c.profileId, role: c.role }], {
				type: 'credential_expiring',
				priority: stage === 'expired' ? 2 : 3,
				title: ownReminderTitle(c.name, c.expiresOn, stage),
				...(stage === 'expired' && c.kind === 'med_admin'
					? { body: 'Until an admin records your renewal, Guad won’t let you record medications.' }
					: {}),
				referenceId: own,
				referenceType: 'staff_credentials'
			});
			sent++;
		}
		const forAdmins = credentialReminderId(c.id, c.expiresOn, `admins-${adminReminderKey(stage)}`);
		if (await alreadySent(tx, agencyId, 'credential_expiring', forAdmins)) continue;
		admins ??= (await activeStaffByRole(tx, agencyId, 'admin')) as Recipient[];
		// The person is told about their own; an admin's own credential isn't sent twice.
		const to = admins.filter((a) => a.id !== c.profileId);
		if (!to.length) continue;
		await notify(tx, agencyId, to, {
			type: 'credential_expiring',
			priority: stage === 'expired' ? 2 : 3,
			title: adminReminderTitle(c.name, c.expiresOn, stage),
			body: 'Open Staff to see who.',
			referenceId: forAdmins,
			referenceType: 'staff_credentials'
		});
		sent++;
	}
	return sent;
}
