import { describe, expect, it } from 'vitest';
import {
	ESCALATION_CHAINS,
	MAX_ESCALATION_STEPS,
	escalationStep,
	escalationTaskName,
	secondsUntilStep
} from '../../../src/lib/domain';
import { digestBody, digestDay } from '../../../src/lib/server/services/notification/digest';

describe('escalation chains', () => {
	it('follow notifications.md §8 and never exceed the hard cap', () => {
		for (const steps of Object.values(ESCALATION_CHAINS)) {
			expect(steps.length).toBeLessThanOrEqual(MAX_ESCALATION_STEPS);
			const delays = steps.map((s) => s.afterMinutes);
			expect([...delays].sort((a, b) => a - b)).toEqual(delays);
		}
		expect(escalationStep('incident_high_severity', 2)).toEqual({
			afterMinutes: 30,
			to: 'admins',
			channel: 'sms'
		});
		expect(escalationStep('coverage_offer', 1)).toBeUndefined();
		expect(escalationStep('health_alert', 3)).toBeUndefined();
	});

	it('times each step from the previous one', () => {
		expect(secondsUntilStep('med_refusal', 1)).toBe(3600);
		expect(secondsUntilStep('med_refusal', 2)).toBe(3600);
		expect(secondsUntilStep('note_sent_back', 2)).toBe(16 * 3600);
		expect(secondsUntilStep('med_refusal', 3)).toBeUndefined();
	});

	it('names tasks per event and step, with Cloud Tasks-safe characters', () => {
		expect(escalationTaskName('health_alert-0b5e4c7a-8f61', 2)).toBe(
			'escalation-health_alert-0b5e4c7a-8f61-2'
		);
		expect(escalationTaskName('a:b/c', 1)).toMatch(/^[A-Za-z0-9_-]+$/);
	});
});

describe('daily digest', () => {
	it('runs once, in the 06:00 sweep of the agency’s local day', () => {
		expect(digestDay(new Date('2026-10-15T10:05:00Z'), 'America/New_York')).toBe('2026-10-15');
		expect(digestDay(new Date('2026-10-15T10:20:00Z'), 'America/New_York')).toBeNull();
		expect(digestDay(new Date('2026-10-15T06:05:00Z'), 'America/New_York')).toBeNull();
	});

	it('shows counts and home names for the recipient’s homes only', () => {
		const counts = {
			pendingNotes: [
				{ homeId: 'oak', n: 2 },
				{ homeId: 'elm', n: 1 }
			],
			openIncidents: [{ homeId: 'elm', n: 1 }],
			refusals: [{ homeId: 'oak', n: 1 }],
			unacknowledged: [],
			filled: [],
			unfilled: [{ homeId: 'oak', n: 1 }],
			clock: []
		};
		const names = new Map([
			['oak', 'Oak House'],
			['elm', 'Elm House']
		]);
		expect(digestBody(counts, names, null)).toBe(
			[
				'Notes pending review: 3 (Elm House 1, Oak House 2)',
				'Open incidents: 1 (Elm House 1)',
				'Medication refusals in the last day: 1 (0 unacknowledged)',
				'Coverage: 0 filled in the last day, 1 unfilled',
				'Clock exceptions in the last day: 0'
			].join('\n')
		);
		expect(digestBody(counts, names, ['oak']).split('\n').slice(0, 2)).toEqual([
			'Notes pending review: 2 (Oak House 2)',
			'Open incidents: 0'
		]);
	});
});
