import { MANDATORY, isNotificationType, type NotificationType } from './notifications';
import { validQuietHours } from './quiet-hours';

/** Essential workflow transports remain available without changing user channel defaults. */
export const AGENCY_REQUIRED_NOTIFICATIONS = new Set<string>([
	...MANDATORY,
	'coverage_offer',
	'controlled_countersign',
	'incident_contact_overdue',
	'prn_followup',
	'med_overdue',
	'system_maintenance',
	'email_delivery_problem'
]);

export interface NotificationOverrides {
	disabledTypes: NotificationType[];
	requireSummaryEmail: boolean;
	quietHours: { start: string; end: string } | null;
}

/** Old or malformed settings cannot disable safety alerts or delivery channels. */
export function notificationOverrides(settings: unknown): NotificationOverrides {
	const value = (settings as { notification_overrides?: unknown } | null)?.notification_overrides;
	const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
	const quiet = raw.quietHours as { start?: unknown; end?: unknown } | null;
	return {
		disabledTypes: Array.isArray(raw.disabledTypes)
			? [
					...new Set(
						raw.disabledTypes.filter(
							(t): t is NotificationType =>
								typeof t === 'string' &&
								isNotificationType(t) &&
								!AGENCY_REQUIRED_NOTIFICATIONS.has(t)
						)
					)
				]
			: [],
		requireSummaryEmail: raw.requireSummaryEmail === true,
		quietHours:
			quiet &&
			typeof quiet.start === 'string' &&
			typeof quiet.end === 'string' &&
			validQuietHours(quiet.start, quiet.end)
				? { start: quiet.start, end: quiet.end }
				: null
	};
}

export function notificationDisabled(type: string, rules: NotificationOverrides): boolean {
	return (
		isNotificationType(type) &&
		!AGENCY_REQUIRED_NOTIFICATIONS.has(type) &&
		rules.disabledTypes.includes(type) &&
		!(type === 'daily_summary' && rules.requireSummaryEmail)
	);
}
