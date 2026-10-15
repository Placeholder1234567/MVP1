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
export const DEFAULT_CHANNELS: Record<string, Row> = {
	coverage_offer: r(['push', 'sms'], [], []),
	coverage_accepted: r(['push'], ['push'], ['push']),
	coverage_unfilled: r([], ['push', 'sms'], ['push', 'sms']),
	note_submitted: r([], ['push'], []),
	note_approved: r(['push'], [], []),
	note_sent_back: r(['push'], [], []),
	med_refusal: r([], ['push'], ['push']),
	med_possible_double_dose: r([], ['push', 'sms'], ['push', 'sms']),
	med_due_reminder: r(['push'], [], []),
	health_alert: r([], ['push'], ['push']),
	incident_reported: r([], ['push'], ['push']),
	incident_high_severity: r([], ['push', 'sms'], ['push', 'sms']),
	incident_review_needed: r([], ['push'], ['push']),
	shift_reminder: r(['push'], [], []),
	clock_anomaly: r([], ['push'], []),
	clock_missed: r(['push'], ['push'], []),
	daily_summary: r([], ['push', 'email'], ['push', 'email']),
	referral_status_change: r([], [], ['push']),
	system_maintenance: r(['push'], ['push', 'email'], ['push', 'email'])
};

/** Always sent, whatever the user's preferences say (clinical safety, compliance). */
export const MANDATORY = new Set([
	'med_refusal',
	'med_possible_double_dose',
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

/**
 * Delivery channels for one recipient (in addition to the in-app list, which
 * always gets a row). A saved preference replaces the role default, except
 * that mandatory types always go by push, plus their default channels.
 */
export function channelsFor(type: string, role: StaffRole, pref?: Preference | null): Channel[] {
	const defaults = DEFAULT_CHANNELS[type]?.[role] ?? [];
	let chosen: Channel[] = pref
		? (['push', 'sms', 'email'] as const).filter((c) => pref[c])
		: [...defaults];
	if (MANDATORY.has(type)) chosen = [...new Set<Channel>(['push', ...defaults, ...chosen])];
	return (['push', 'sms', 'email'] as const).filter((c) => chosen.includes(c));
}

export const DEFAULT_QUIET_HOURS = { start: '23:00', end: '06:00' } as const;

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

/**
 * Whether a send can go out now. Urgent (1) and high (2) priorities ignore
 * quiet hours; email ignores them too (notifications.md "Quiet Hours").
 */
export function canSendNow(
	channel: Channel,
	priority: number,
	localTimeHHMM: string,
	window?: { start: string; end: string }
): boolean {
	if (channel === 'email' || priority <= 2) return true;
	return !inQuietHours(localTimeHHMM, window);
}
