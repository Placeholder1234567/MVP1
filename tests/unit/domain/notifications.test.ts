import { describe, expect, it } from 'vitest';
import { canSendNow, channelsFor, inQuietHours, overDailyLimit } from '../../../src/lib/domain';

describe('channelsFor', () => {
	it('uses the role defaults from notifications.md', () => {
		expect(channelsFor('coverage_offer', 'caregiver')).toEqual(['push', 'sms']);
		expect(channelsFor('coverage_offer', 'supervisor')).toEqual([]);
		expect(channelsFor('daily_summary', 'admin')).toEqual(['push', 'email']);
	});

	it('a saved preference replaces the default', () => {
		expect(
			channelsFor('shift_reminder', 'caregiver', { push: false, sms: true, email: false })
		).toEqual(['sms']);
	});

	it('mandatory types always get push plus their defaults, even if switched off', () => {
		const off = { push: false, sms: false, email: false };
		expect(channelsFor('med_possible_double_dose', 'supervisor', off)).toEqual(['push', 'sms']);
		expect(channelsFor('health_alert', 'supervisor', off)).toEqual(['push']);
		// mandatory for whoever receives it, even a role with no default
		expect(channelsFor('health_alert', 'caregiver')).toEqual(['push']);
	});

	it('unknown types get nothing beyond the in-app list', () => {
		expect(channelsFor('made_up', 'admin')).toEqual([]);
	});
});

describe('quiet hours', () => {
	it('default 23:00-06:00 crosses midnight', () => {
		expect(inQuietHours('23:00')).toBe(true);
		expect(inQuietHours('02:30')).toBe(true);
		expect(inQuietHours('06:00')).toBe(false);
		expect(inQuietHours('22:59')).toBe(false);
	});

	it('custom windows that do not cross midnight', () => {
		expect(inQuietHours('13:00', { start: '12:00', end: '16:00' })).toBe(true);
		expect(inQuietHours('16:00', { start: '12:00', end: '16:00' })).toBe(false);
	});

	it('urgent and high priority, and email, ignore quiet hours', () => {
		expect(canSendNow('push', 1, '02:00')).toBe(true);
		expect(canSendNow('sms', 2, '02:00')).toBe(true);
		expect(canSendNow('email', 4, '02:00')).toBe(true);
		expect(canSendNow('push', 3, '02:00')).toBe(false);
		expect(canSendNow('push', 3, '09:00')).toBe(true);
		// Reminders for staff on an overnight shift aren't held until morning.
		expect(canSendNow('push', 3, '02:00', undefined, 'med_due_reminder')).toBe(true);
		expect(canSendNow('push', 3, '02:00', undefined, 'prn_followup')).toBe(true);
		expect(canSendNow('push', 3, '02:00', undefined, 'shift_reminder')).toBe(false);
	});
});

describe('overDailyLimit', () => {
	it('allows up to the channel limit in 24 hours', () => {
		expect(overDailyLimit('push', 3, 49)).toBe(false);
		expect(overDailyLimit('push', 3, 50)).toBe(true);
		expect(overDailyLimit('sms', 2, 10)).toBe(true);
		expect(overDailyLimit('email', 3, 19)).toBe(false);
		expect(overDailyLimit('email', 3, 20)).toBe(true);
	});
	it('lets urgent push and SMS through, but not email', () => {
		expect(overDailyLimit('push', 1, 500)).toBe(false);
		expect(overDailyLimit('sms', 1, 500)).toBe(false);
		expect(overDailyLimit('email', 1, 20)).toBe(true);
	});
});
