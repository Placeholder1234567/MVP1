import { describe, expect, it } from 'vitest';
import {
	adminReminderKey,
	adminReminderTitle,
	credentialName,
	credentialStatus,
	ownReminderTitle,
	reminderStage
} from '../../../src/lib/domain';

const today = '2026-10-27';

describe('credential status', () => {
	it('is valid through its expiry date and lapsed the day after', () => {
		expect(credentialStatus('2026-10-27', today)).toBe('expiring');
		expect(credentialStatus('2026-10-26', today)).toBe('expired');
		expect(credentialStatus('2026-11-26', today)).toBe('expiring');
		expect(credentialStatus('2026-11-27', today)).toBe('current');
		expect(credentialStatus(null, today)).toBe('no_expiry');
	});

	it('works across a daylight saving change', () => {
		expect(credentialStatus('2026-11-03', '2026-10-31')).toBe('expiring');
		expect(reminderStage('2026-11-07', '2026-10-31')).toBe(7);
	});
});

describe('reminder stage', () => {
	it('is the smallest window the credential is in', () => {
		expect(reminderStage('2026-12-01', today)).toBe(null);
		expect(reminderStage('2026-11-26', today)).toBe(30);
		expect(reminderStage('2026-11-10', today)).toBe(14);
		expect(reminderStage('2026-11-03', today)).toBe(7);
		expect(reminderStage('2026-10-27', today)).toBe(7);
		expect(reminderStage('2026-10-26', today)).toBe('expired');
		expect(reminderStage(null, today)).toBe(null);
	});

	it('tells admins once while expiring and once when lapsed', () => {
		expect(adminReminderKey(30)).toBe(adminReminderKey(7));
		expect(adminReminderKey('expired')).not.toBe(adminReminderKey(7));
	});
});

describe('names and text', () => {
	it('uses the label for named kinds and the agency name for others', () => {
		expect(credentialName('cpr', 'ignored')).toBe('CPR');
		expect(credentialName('other', '  Mandt ')).toBe('Mandt');
	});

	it('names the credential and date only', () => {
		expect(ownReminderTitle('CPR', '2026-11-03', 7)).toBe(
			'Your CPR expires on 2026-11-03. Plan your renewal.'
		);
		expect(adminReminderTitle('CPR', '2026-10-26', 'expired')).toBe(
			"A staff member's CPR expired on 2026-10-26"
		);
	});
});
