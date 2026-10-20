// Medication-due reminders (notifications.md §2.8), run by the
// med-reminder-sweep every 5 minutes. For each agency, doses with no MAR
// record that are due within 30 minutes send med_due_reminder to the
// caregivers scheduled at the home (the current shift and the dose's shift),
// and doses still unrecorded 30 minutes after their time send med_overdue to
// the home's supervisors. Alerts name the home only. Each alert references a
// stable ID made from its type, home, day and dose time, so a home and dose
// time is alerted once however often the sweep runs. The same sweep asks
// whoever gave an as-needed dose to record its effect 30 minutes later
// (prn_followup, referenced by the MAR record, once per dose).
import { createHash } from 'node:crypto';
import {
	addDays,
	doseAlerts,
	localTime,
	OVERDUE_UNTIL_MINUTES,
	PRN_FOLLOWUP_MINUTES,
	PRN_FOLLOWUP_UNTIL_MINUTES,
	shiftAt,
	type DoseAlert
} from '../../../domain/index.ts';
import { resolveFeatures } from '../../../entitlements/tier-features.ts';
import { withService, type Tx } from '../../db';
import { agencyClocks } from './escalation.queries';
import { notify, notifyHomeSupervisors } from './index';
import {
	alreadySent,
	assignedCaregivers,
	doseRecords,
	homeNamesFor,
	prnDosesAwaitingEffect,
	scheduledMeds
} from './med-reminders.queries';

const minutes = (at: Date, n: number) => new Date(at.getTime() + n * 60_000);

const NAMESPACE = Buffer.from('9b1f6c2e4d7a4e0b8c3f5a6d7e8f9012', 'hex');

/** UUIDv5-style ID for one alert about one home's dose time. */
export function doseAlertId(type: string, d: Pick<DoseAlert, 'homeId' | 'day' | 'time'>): string {
	const bytes = createHash('sha1')
		.update(NAMESPACE)
		.update(`${type}|${d.homeId}|${d.day}|${d.time}`)
		.digest()
		.subarray(0, 16);
	bytes[6] = (bytes[6] & 15) | 0x50;
	bytes[8] = (bytes[8] & 63) | 0x80;
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function sweepMedReminders(
	now = new Date()
): Promise<{ due: number; overdue: number; followups: number }> {
	const agencies = await withService((tx) => agencyClocks(tx));
	let due = 0;
	let overdue = 0;
	let followups = 0;
	for (const a of agencies) {
		// Without the MAR on its plan an agency can't record doses, so every
		// dose would read as missed.
		if (!resolveFeatures(a.tier, a.enabledFeatures).has('mar')) continue;
		const sent = await withService((tx) => remindAgency(tx, a.id, a.timeZone, now));
		due += sent.due;
		overdue += sent.overdue;
		followups += await withService((tx) => prnFollowups(tx, a.id, now));
	}
	return { due, overdue, followups };
}

/** Asks whoever gave an as-needed dose to record how it worked. */
export async function prnFollowups(tx: Tx, agencyId: string, now: Date): Promise<number> {
	const doses = await prnDosesAwaitingEffect(
		tx,
		agencyId,
		minutes(now, -PRN_FOLLOWUP_UNTIL_MINUTES),
		minutes(now, -PRN_FOLLOWUP_MINUTES)
	);
	let sent = 0;
	for (const d of doses) {
		if (await alreadySent(tx, agencyId, 'prn_followup', d.id)) continue;
		await notify(tx, agencyId, [{ id: d.profileId, role: d.role }], {
			type: 'prn_followup',
			priority: 3,
			title: 'A follow-up is due. Tap to record it.',
			body: 'Record how an as-needed dose worked.',
			referenceId: d.id,
			referenceType: 'mar_record'
		});
		sent++;
	}
	return sent;
}

export async function remindAgency(
	tx: Tx,
	agencyId: string,
	timeZone: string,
	now: Date
): Promise<{ due: number; overdue: number }> {
	const meds = (await scheduledMeds(tx, agencyId, minutes(now, -OVERDUE_UNTIL_MINUTES))).map(
		(m) => ({ ...m, homeId: m.homeId! })
	);
	if (!meds.length) return { due: 0, overdue: 0 };
	const today = localTime(now, timeZone).day;
	const days = [addDays(today, -1), today, addDays(today, 1)];
	const records = await doseRecords(
		tx,
		agencyId,
		meds.map((m) => m.id),
		days
	);
	const alerts = doseAlerts(meds, records, now, timeZone);
	const homeIds = [...new Set([...alerts.due, ...alerts.overdue].map((d) => d.homeId))];
	const names = new Map((await homeNamesFor(tx, agencyId, homeIds)).map((h) => [h.id, h.name]));
	const homeName = (d: DoseAlert) => names.get(d.homeId) ?? 'the home';

	let due = 0;
	for (const d of alerts.due) {
		const id = doseAlertId('med_due_reminder', d);
		if (await alreadySent(tx, agencyId, 'med_due_reminder', id)) continue;
		const shifts = [shiftAt(now, timeZone), shiftAt(d.at, timeZone)];
		const to = await assignedCaregivers(tx, agencyId, d.homeId, shifts);
		if (!to.length) continue;
		await notify(tx, agencyId, to, {
			type: 'med_due_reminder',
			priority: 3,
			title: `Medication administration due at ${homeName(d)} in 30 minutes.`,
			referenceId: id,
			referenceType: 'dose_time'
		});
		due++;
	}

	let overdue = 0;
	for (const d of alerts.overdue) {
		const id = doseAlertId('med_overdue', d);
		if (await alreadySent(tx, agencyId, 'med_overdue', id)) continue;
		await notifyHomeSupervisors(tx, agencyId, d.homeId, {
			type: 'med_overdue',
			priority: 2,
			title: `Medication administration overdue at ${homeName(d)}.`,
			body: `A dose due at ${d.time} has not been recorded.`,
			referenceId: id,
			referenceType: 'dose_time'
		});
		overdue++;
	}
	return { due, overdue };
}
