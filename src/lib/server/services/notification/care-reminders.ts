// Scheduled care notices, run by the care-reminder-sweep every 15 minutes:
// - shift_reminder (notifications.md §2.13): the assigned caregiver, about an
//   hour before their shift starts, once per slot;
// - incident_review_needed (§2.12): an incident still open 24 hours after it
//   was reported, to the home's supervisors and the agency's admins, once per
//   incident. The escalation chain repeats it daily and stops after 3 days.
import {
	addDays,
	INCIDENT_REVIEW_AFTER_HOURS,
	INCIDENT_REVIEW_UNTIL_HOURS,
	incidentReviewTitle,
	localTime,
	SHIFTS,
	shiftReminderTitle,
	shiftsStartingSoon
} from '../../../domain/index.ts';
import { withService, type Tx } from '../../db';
import { assignedSlots, openIncidents } from './care-events.queries';
import { agencyClocks } from './escalation.queries';
import { notify, type Recipient } from './index';
import { alreadySent } from './med-reminders.queries';
import { activeStaffByRole } from './notification.queries';

const hours = (at: Date, n: number) => new Date(at.getTime() + n * 3_600_000);

export async function sweepCareReminders(
	now = new Date()
): Promise<{ shifts: number; incidents: number }> {
	let shifts = 0;
	let incidents = 0;
	for (const a of await withService((tx) => agencyClocks(tx))) {
		shifts += await withService((tx) => remindShifts(tx, a.id, a.timeZone, now));
		incidents += await withService((tx) => flagIncidents(tx, a.id, a.timeZone, now));
	}
	return { shifts, incidents };
}

export async function remindShifts(tx: Tx, agencyId: string, timeZone: string, now: Date) {
	const today = localTime(now, timeZone).day;
	const slots = await assignedSlots(tx, agencyId, [today, addDays(today, 1)]);
	let sent = 0;
	for (const slot of shiftsStartingSoon(slots, now, timeZone)) {
		if (await alreadySent(tx, agencyId, 'shift_reminder', slot.id)) continue;
		const label = SHIFTS.find((s) => s.key === slot.shift)!.label;
		await notify(tx, agencyId, [{ id: slot.profileId, role: slot.role }], {
			type: 'shift_reminder',
			priority: 3,
			title: shiftReminderTitle(label, slot.homeName, slot.start),
			referenceId: slot.id,
			referenceType: 'schedule_slots'
		});
		sent++;
	}
	return sent;
}

export async function flagIncidents(tx: Tx, agencyId: string, timeZone: string, now: Date) {
	const open = await openIncidents(
		tx,
		agencyId,
		hours(now, -INCIDENT_REVIEW_UNTIL_HOURS),
		hours(now, -INCIDENT_REVIEW_AFTER_HOURS)
	);
	if (!open.length) return 0;
	const admins = await activeStaffByRole(tx, agencyId, 'admin');
	let sent = 0;
	for (const incident of open) {
		if (await alreadySent(tx, agencyId, 'incident_review_needed', incident.id)) continue;
		const supervisors = await activeStaffByRole(tx, agencyId, 'supervisor', incident.homeId);
		const to = new Map<string, Recipient>();
		for (const r of [...supervisors, ...admins]) to.set(r.id, r as Recipient);
		const day = localTime(incident.occurredAt ?? incident.createdAt, timeZone).day;
		await notify(tx, agencyId, [...to.values()], {
			type: 'incident_review_needed',
			priority: 2,
			title: incidentReviewTitle(incident.homeName ?? 'your home', day),
			referenceId: incident.id,
			referenceType: 'incidents'
		});
		sent++;
	}
	return sent;
}
