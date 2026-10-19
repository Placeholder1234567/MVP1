import { expect, it } from 'vitest';
import {
	notificationOverrides,
	notificationDisabled
} from '../../../src/lib/domain/notification-overrides';
import { NotificationOverridesInput } from '../../../src/lib/server/services/notification/overrides-input';

it('malformed or old settings cannot turn off safety alerts', () => {
	const rules = notificationOverrides({
		notification_overrides: {
			disabledTypes: ['health_alert', 'shift_reminder', 'unknown', 'shift_reminder'],
			quietHours: { start: '25:00', end: '06:00' },
			requireSummaryEmail: 'true'
		}
	});
	expect(rules).toEqual({
		disabledTypes: ['shift_reminder'],
		quietHours: null,
		requireSummaryEmail: false
	});
	expect(notificationDisabled('health_alert', rules)).toBe(false);
	expect(notificationDisabled('shift_reminder', rules)).toBe(true);
	expect(notificationOverrides(null).disabledTypes).toEqual([]);
});
it('required summary email wins over conflicting legacy disabled settings', () => {
	const rules = notificationOverrides({
		notification_overrides: { disabledTypes: ['daily_summary'], requireSummaryEmail: true }
	});
	expect(notificationDisabled('daily_summary', rules)).toBe(false);
});
it('validates safety exclusions, quiet-hour duration and conflicting admin choices', () => {
	const base = { disabledTypes: [], requireSummaryEmail: false, quietHours: null };
	expect(
		NotificationOverridesInput.safeParse({ ...base, disabledTypes: ['health_alert'] }).success
	).toBe(false);
	expect(
		NotificationOverridesInput.safeParse({
			...base,
			disabledTypes: ['daily_summary'],
			requireSummaryEmail: true
		}).success
	).toBe(false);
	expect(
		NotificationOverridesInput.safeParse({ ...base, quietHours: { start: '23:00', end: '01:00' } })
			.success
	).toBe(false);
	expect(
		NotificationOverridesInput.parse({ ...base, quietHours: { start: '22:00', end: '06:00' } })
			.quietHours
	).toEqual({ start: '22:00', end: '06:00' });
});
