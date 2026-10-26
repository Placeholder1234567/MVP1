// Notification channel rules (notifications.md "Default Preferences by Role",
// "Mandatory Notifications", "Quiet Hours").
import { hhmm } from './time';

export type Channel = 'push' | 'sms' | 'email';
export type StaffRole = 'caregiver' | 'supervisor' | 'admin';
type Row = Record<StaffRole, readonly Channel[]>;

const r = (caregiver: Channel[], supervisor: Channel[], admin: Channel[]): Row => ({
	caregiver,
	supervisor,
	admin
});

/** Channels each role gets by default, per type (notifications.md table). */
export const DEFAULT_CHANNELS = {
	coverage_offer: r(['push', 'sms'], [], []),
	coverage_accepted: r(['push'], ['push'], ['push']),
	coverage_unfilled: r([], ['push', 'sms'], ['push', 'sms']),
	note_submitted: r([], ['push'], []),
	note_approved: r(['push'], [], []),
	note_sent_back: r(['push'], [], []),
	med_refusal: r([], ['push'], ['push']),
	med_possible_double_dose: r([], ['push', 'sms'], ['push', 'sms']),
	// A dose recorded as given after its medication was stopped (§2.7d).
	med_given_after_stop: r([], ['push', 'sms'], ['push', 'sms']),
	med_due_reminder: r(['push'], [], []),
	// A controlled medication count doesn't match the record (§2.7b), and a
	// named witness asked to countersign a count book entry (§2.7c).
	controlled_count_discrepancy: r([], ['push', 'sms'], ['push', 'sms']),
	controlled_countersign: r(['push'], ['push'], ['push']),
	// A scheduled dose still unrecorded 30 minutes after its time (§2.8 escalation).
	med_overdue: r([], ['push'], ['push']),
	// An as-needed dose given 30 minutes ago still has no effect recorded.
	prn_followup: r(['push'], ['push'], ['push']),
	health_alert: r([], ['push'], ['push']),
	incident_reported: r([], ['push'], ['push']),
	incident_high_severity: r([], ['push', 'sms'], ['push', 'sms']),
	incident_review_needed: r([], ['push'], ['push']),
	// A required contact's reminder time passed without it being marked as told.
	incident_contact_overdue: r([], ['push'], ['push']),
	shift_reminder: r(['push'], [], []),
	clock_anomaly: r([], ['push'], []),
	clock_missed: r(['push'], ['push'], []),
	daily_summary: r([], ['push', 'email'], ['push', 'email']),
	referral_status_change: r([], [], ['push']),
	system_maintenance: r(['push'], ['push', 'email'], ['push', 'email']),
	// A staff address bounced for good or reported Guad as spam (notifications.md §7).
	email_delivery_problem: r([], [], ['push']),
	// Dormant accounts, stale home access, a new admin (security.md "Access Reviews").
	access_review: r([], [], ['push', 'email']),
	report_ready: r([], ['push', 'email'], ['push', 'email'])
} satisfies Record<string, Row>;

export type NotificationType = keyof typeof DEFAULT_CHANNELS;
export const NOTIFICATION_TYPES = Object.keys(DEFAULT_CHANNELS) as NotificationType[];
export function isNotificationType(type: string): type is NotificationType {
	return Object.hasOwn(DEFAULT_CHANNELS, type);
}

export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
	coverage_offer: 'Coverage offers',
	coverage_accepted: 'Coverage filled',
	coverage_unfilled: 'Unfilled coverage',
	note_submitted: 'Notes awaiting review',
	note_approved: 'Approved notes',
	note_sent_back: 'Returned notes',
	med_refusal: 'Medication refusals',
	med_possible_double_dose: 'Possible duplicate doses',
	med_given_after_stop: 'Stopped medications given',
	med_due_reminder: 'Medication reminders',
	med_overdue: 'Overdue medications',
	prn_followup: 'As-needed dose follow-ups',
	health_alert: 'Health alerts',
	incident_reported: 'New incidents',
	incident_high_severity: 'Urgent incidents',
	incident_review_needed: 'Incident review reminders',
	incident_contact_overdue: 'Incident contacts not yet told',
	shift_reminder: 'Shift reminders',
	clock_anomaly: 'Clock location exceptions',
	clock_missed: 'Missed clock punches',
	daily_summary: 'Daily summaries',
	referral_status_change: 'Referral updates',
	system_maintenance: 'System maintenance',
	controlled_count_discrepancy: 'Controlled medication count discrepancies',
	controlled_countersign: 'Requests to witness a count',
	email_delivery_problem: 'Email delivery problems',
	access_review: 'Access review alerts',
	report_ready: 'Scheduled reports ready'
};

/** Always sent, whatever the user's preferences say (clinical safety, compliance). */
export const MANDATORY = new Set([
	'med_refusal',
	'med_possible_double_dose',
	'med_given_after_stop',
	'controlled_count_discrepancy',
	'health_alert',
	'incident_reported',
	'incident_high_severity',
	'coverage_unfilled'
]);

export interface Preference {
	push: boolean;
	sms: boolean;
	email: boolean;
}

/** Safety channels stay enabled even when other delivery preferences change. */
export function requiredChannels(type: string, role: StaffRole): Channel[] {
	return MANDATORY.has(type)
		? [
				...new Set<Channel>([
					'push',
					...(isNotificationType(type) ? DEFAULT_CHANNELS[type][role] : [])
				])
			]
		: [];
}

/**
 * Delivery channels for one recipient (in addition to the in-app list, which
 * always gets a row). A saved preference replaces the role default, except
 * that mandatory types always go by push, plus their default channels.
 */
export function channelsFor(type: string, role: StaffRole, pref?: Preference | null): Channel[] {
	const defaults = isNotificationType(type) ? DEFAULT_CHANNELS[type][role] : [];
	let chosen: Channel[] = pref
		? (['push', 'sms', 'email'] as const).filter((c) => pref[c])
		: [...defaults];
	chosen = [...new Set<Channel>([...requiredChannels(type, role), ...chosen])];
	return (['push', 'sms', 'email'] as const).filter((c) => chosen.includes(c));
}

export const DEFAULT_QUIET_HOURS = { start: '23:00', end: '06:00' } as const;

/** Only terminal urgent SMS failures need this immediate delivery assurance. */
export function needsSmsPushFallback(input: {
	priority: number;
	status: string;
	active: boolean;
	acknowledged: boolean;
	pushAllowed: boolean;
}): boolean {
	return (
		input.priority === 1 &&
		input.status === 'failed' &&
		input.active &&
		!input.acknowledged &&
		input.pushAllowed
	);
}

/**
 * Whether a mandatory alert whose push failed for good (no device registered,
 * every token dead, or out of retries) should be texted instead
 * (notifications.md §5 "Permission Denied Fallback"). Never when texts are
 * off for this type: that is how a STOP reply is stored, and carriers block
 * opted-out numbers anyway.
 */
export function needsPushSmsFallback(input: {
	type: string;
	status: string;
	active: boolean;
	acknowledged: boolean;
	hasPhone: boolean;
	/** The saved SMS setting for this type; undefined when none is saved */
	smsPreference: boolean | null | undefined;
}): boolean {
	return (
		MANDATORY.has(input.type) &&
		input.status === 'failed' &&
		input.active &&
		!input.acknowledged &&
		input.hasPhone &&
		input.smsPreference !== false
	);
}

/** Whether a local time (HH:MM) falls in quiet hours; the window may cross midnight. */
export function inQuietHours(
	time: string,
	window: { start: string; end: string } = DEFAULT_QUIET_HOURS
): boolean {
	const t = hhmm(time);
	const start = hhmm(window.start);
	const end = hhmm(window.end);
	return start <= end ? t >= start && t < end : t >= start || t < end;
}

/** Per-person deliveries allowed per channel in a rolling 24 hours (notifications.md §10). */
export const DAILY_LIMITS: Record<Channel, number> = {
	push: 50,
	sms: 10,
	email: 20
};

/**
 * Whether a delivery is over the person's daily limit, given how many they
 * were sent on that channel in the last 24 hours. Urgent (priority 1) push
 * and SMS still go out; email has no bypass.
 */
export function overDailyLimit(channel: Channel, priority: number, sentLastDay: number): boolean {
	if (priority === 1 && channel !== 'email') return false;
	return sentLastDay >= DAILY_LIMITS[channel];
}

/**
 * Sent only to staff working right now, about work due now (a dose coming
 * up, the effect of one just given). Quiet hours are for time off, so they
 * never hold these: held until 06:00, an overnight caregiver's reminder for
 * a 02:00 dose would arrive hours after it was due.
 */
export const ON_SHIFT_TYPES: ReadonlySet<string> = new Set(['med_due_reminder', 'prn_followup']);

/**
 * Whether a send can go out now. Urgent (1) and high (2) priorities ignore
 * quiet hours, as do on-shift reminders (ON_SHIFT_TYPES); email ignores them
 * too (notifications.md "Quiet Hours").
 */
export function canSendNow(
	channel: Channel,
	priority: number,
	localTimeHHMM: string,
	window?: { start: string; end: string },
	type?: string
): boolean {
	if (channel === 'email' || priority <= 2) return true;
	if (type && ON_SHIFT_TYPES.has(type)) return true;
	return !inQuietHours(localTimeHHMM, window);
}
