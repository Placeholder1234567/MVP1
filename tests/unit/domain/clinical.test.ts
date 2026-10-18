import { describe, expect, it } from 'vitest';
import {
	attentionItems,
	goalMilestone,
	clock12,
	doseNeedsReason,
	healthFlags,
	healthPayload,
	healthSummary,
	incidentOccurredAt,
	incidentUrgency,
	jsonList,
	missingNotifications,
	roundedClock,
	vitalFieldWarning,
	zonedInstant,
	type AttentionInput
} from '../../../src/lib/domain';

const TZ = 'America/New_York';

describe('healthPayload', () => {
	it('keeps numeric vitals as numbers and skips blanks', () => {
		expect(
			healthPayload('vitals', { systolic: '128', diastolic: '82', pulse: '', temp: '98.4' })
		).toEqual({ ok: true, data: { systolic: 128, diastolic: 82, temp: 98.4 } });
		expect(healthPayload('vitals', { pulse: 76 as unknown as string })).toEqual({
			ok: true,
			data: { pulse: 76 }
		});
	});

	it('needs at least one reading', () => {
		expect(healthPayload('vitals', {})).toEqual({
			ok: false,
			error: 'Enter at least one reading.'
		});
	});

	it('asks to check readings that are almost certainly typos', () => {
		const r = healthPayload('vitals', { systolic: '1200' });
		expect(r.ok).toBe(false);
		expect(healthPayload('vitals', { temp: 'abc' }).ok).toBe(false);
	});

	it('applies the MVP required fields per entry type', () => {
		expect(healthPayload('seizure', { observed: 'Shaking' })).toEqual({
			ok: false,
			error: 'Add when it started and what you saw.'
		});
		expect(
			healthPayload('seizure', { started: '14:05', observed: 'Shaking', actions: 'Timed it' })
		).toEqual({ ok: true, data: { started: '14:05', observed: 'Shaking', actions: 'Timed it' } });
		expect(healthPayload('illness', { onset: 'Today' }).ok).toBe(false);
		expect(healthPayload('appointment', { reason: 'Checkup' }).ok).toBe(false);
		expect(healthPayload('appointment', { provider: ' Dr. Test ' })).toEqual({
			ok: true,
			data: { provider: 'Dr. Test' }
		});
	});
});

describe('healthFlags and vitalFieldWarning', () => {
	it('uses the shared vital thresholds with form keys', () => {
		expect(healthFlags('vitals', { temp: 100.4, systolic: 120, diastolic: 80 })).toEqual([
			'temperature'
		]);
		expect(healthFlags('vitals', { systolic: 140 })).toEqual(['blood_pressure']);
		expect(healthFlags('vitals', { diastolic: 59 })).toEqual(['blood_pressure']);
		expect(healthFlags('vitals', { pulse: 100 })).toEqual([]);
		expect(healthFlags('vitals', { pulse: '' })).toEqual([]);
		expect(healthFlags('seizure', { temp: 104 })).toEqual([]);
	});

	it('warns per field, only for out-of-range numbers', () => {
		expect(vitalFieldWarning('temp', '101.2')).toBe('Temperature is outside the normal range.');
		expect(vitalFieldWarning('pulse', 49)).toBe('Pulse is outside the normal range.');
		expect(vitalFieldWarning('systolic', '90')).toBeNull();
		expect(vitalFieldWarning('diastolic', '90')).toBe(
			'Blood pressure (bottom) is outside the normal range.'
		);
		expect(vitalFieldWarning('temp', '')).toBeNull();
		expect(vitalFieldWarning('temp', null)).toBeNull();
	});
});

describe('healthSummary', () => {
	it('summarises each entry type like the MVP Recent list', () => {
		expect(healthSummary('vitals', { systolic: 128, diastolic: 82, pulse: 76, temp: 98.4 })).toBe(
			'BP 128/82 · Pulse 76 · 98.4°F'
		);
		expect(healthSummary('seizure', { duration: '2 min', observed: 'Shaking' })).toBe(
			'2 min · Shaking'
		);
		expect(healthSummary('seizure', { type: 'Older entry' })).toBe('Older entry');
		expect(healthSummary('illness', { symptoms: 'Cough', contagious: 'Yes' })).toBe(
			'Cough · May be contagious'
		);
		expect(healthSummary('appointment', { provider: 'Dr. Test', reason: 'Checkup' })).toBe(
			'Dr. Test · Checkup'
		);
	});
});

describe('medication helpers', () => {
	it('formats slot times in 12-hour form', () => {
		expect(clock12('08:00')).toBe('8:00am');
		expect(clock12('20:30:00')).toBe('8:30pm');
		expect(clock12('00:15')).toBe('12:15am');
		expect(clock12('12:00')).toBe('12:00pm');
	});

	it('requires a reason for everything except a scheduled dose given', () => {
		expect(doseNeedsReason('given', false, false)).toBe(false);
		expect(doseNeedsReason('refused', false, false)).toBe(true);
		expect(doseNeedsReason('held', false, false)).toBe(true);
		expect(doseNeedsReason('given', true, false)).toBe(true);
		expect(doseNeedsReason('given', false, true)).toBe(true);
	});
});

describe('incident time', () => {
	it('rounds the current time to 5 minutes in the agency zone', () => {
		expect(roundedClock(new Date('2026-10-15T18:32:00Z'), TZ)).toBe('14:30');
		expect(roundedClock(new Date('2026-10-15T18:33:00Z'), TZ)).toBe('14:35');
		expect(roundedClock(new Date('2026-10-16T03:58:00Z'), TZ)).toBe('23:55');
	});

	it('converts wall-clock time to an instant across daylight saving', () => {
		expect(zonedInstant('2026-10-15', '14:30', TZ).toISOString()).toBe('2026-10-15T18:30:00.000Z');
		expect(zonedInstant('2026-12-15', '14:30', TZ).toISOString()).toBe('2026-12-15T19:30:00.000Z');
		expect(zonedInstant('2026-10-15', '09:00', 'UTC').toISOString()).toBe(
			'2026-10-15T09:00:00.000Z'
		);
	});

	it('uses yesterday when the time would be in the future', () => {
		const now = new Date('2026-10-15T04:30:00Z'); // 00:30 in New York
		expect(incidentOccurredAt('23:40', now, TZ)?.toISOString()).toBe('2026-10-15T03:40:00.000Z');
		expect(incidentOccurredAt('00:20', now, TZ)?.toISOString()).toBe('2026-10-15T04:20:00.000Z');
		expect(incidentOccurredAt('', now, TZ)).toBeNull();
		expect(incidentOccurredAt('25:00', now, TZ)).toBeNull();
	});
});

describe('incident notifications and urgency', () => {
	it('lists required contacts not yet marked as told, leaving out the supervisor', () => {
		expect(missingNotifications('Low', 'Other', [])).toEqual(['Family or guardian']);
		expect(missingNotifications('High', 'Fall', ['Nurse'])).toEqual([
			'Family or guardian',
			'State reporting system'
		]);
		expect(missingNotifications('Low', 'Other', ['Family or guardian'])).toEqual([]);
	});

	it('bands incidents: high and medication errors are critical', () => {
		expect(incidentUrgency('High', 'Fall', [])).toBe('critical');
		expect(incidentUrgency('Low', 'Medication error', [])).toBe('critical');
		expect(incidentUrgency('Medium', 'Fall', [])).toBe('action');
		expect(incidentUrgency('Low', 'Other', [])).toBe('info');
		expect(incidentUrgency('Low', 'Other', ['Family or guardian'])).toBe('action');
	});
});

describe('jsonList', () => {
	it('reads device JSON text safely', () => {
		expect(jsonList('["a","b"]')).toEqual(['a', 'b']);
		expect(jsonList(['x'])).toEqual(['x']);
		expect(jsonList('not json')).toEqual([]);
		expect(jsonList('{"a":1}')).toEqual([]);
		expect(jsonList(null)).toEqual([]);
	});
});

describe('attentionItems', () => {
	const empty: AttentionInput = {
		today: '2026-10-15',
		incidents: [],
		health: [],
		doses: [],
		coverage: [],
		clocks: [],
		notes: []
	};

	it('is empty when nothing needs attention', () => {
		expect(attentionItems(empty)).toEqual([]);
	});

	it('bands every source and orders critical first', () => {
		const items = attentionItems({
			...empty,
			incidents: [
				{
					id: 'i1',
					client_id: 'c1',
					type: 'Fall',
					severity: 'High',
					status: 'open',
					notified_parties: '["Family or guardian","Nurse","State reporting system"]',
					occurred_at: '2026-10-15T13:00:00Z'
				},
				{
					id: 'i2',
					client_id: 'c1',
					type: 'Other',
					severity: 'Low',
					status: 'open',
					notified_parties: '["Family or guardian"]',
					occurred_at: '2026-10-15T12:00:00Z'
				},
				{
					id: 'i3',
					client_id: 'c1',
					type: 'Fall',
					severity: 'High',
					status: 'reviewed',
					notified_parties: '[]',
					occurred_at: '2026-10-15T12:00:00Z'
				}
			],
			health: [
				{
					id: 'h1',
					client_id: 'c2',
					kind: 'vitals',
					flags: '["temperature"]',
					acknowledged: 0,
					recorded_at: '2026-10-15T10:00:00Z'
				},
				{
					id: 'h2',
					client_id: 'c2',
					kind: 'vitals',
					flags: '["pulse"]',
					acknowledged: 1,
					recorded_at: '2026-10-15T10:00:00Z'
				},
				{
					id: 'h3',
					client_id: 'c2',
					kind: 'vitals',
					flags: '[]',
					acknowledged: 0,
					recorded_at: '2026-10-15T10:00:00Z'
				}
			],
			doses: [
				{
					id: 'd1',
					client_id: 'c1',
					status: 'refused',
					reason: 'Spat it out',
					acknowledged: 0,
					conflict_with: null,
					recorded_at: '2026-10-15T12:00:00Z',
					medicationName: 'Test med'
				},
				{
					id: 'd2',
					client_id: 'c1',
					status: 'given',
					reason: null,
					acknowledged: 0,
					conflict_with: 'd0',
					recorded_at: '2026-10-15T12:05:00Z'
				},
				{
					id: 'd3',
					client_id: 'c1',
					status: 'given',
					reason: null,
					acknowledged: 0,
					conflict_with: null,
					recorded_at: '2026-10-15T12:00:00Z'
				},
				{
					id: 'd4',
					client_id: 'c1',
					status: 'held',
					reason: 'Asleep',
					acknowledged: 1,
					conflict_with: null,
					recorded_at: '2026-10-15T12:00:00Z'
				}
			],
			coverage: [
				{ id: 'k1', day: '2026-10-16', shift: 'pm', status: 'unfilled' },
				{ id: 'k2', day: '2026-10-15', shift: 'on', status: 'searching' },
				{ id: 'k3', day: '2026-10-14', shift: 'am', status: 'unfilled' },
				{ id: 'k4', day: '2026-10-16', shift: 'am', status: 'filled' }
			],
			clocks: [
				{
					id: 'cl1',
					verified: 0,
					acknowledged: 0,
					clock_in_at: '2026-10-15T11:00:00Z',
					staffName: 'Test Staff'
				},
				{ id: 'cl2', verified: 1, acknowledged: 0, clock_in_at: '2026-10-15T11:00:00Z' },
				{ id: 'cl3', verified: 0, acknowledged: 1, clock_in_at: '2026-10-15T11:00:00Z' }
			],
			notes: [
				{
					id: 'n1',
					client_id: 'c1',
					status: 'submitted',
					type: 'shift',
					author_name: 'Test Staff',
					updated_at: '2026-10-15T14:00:00Z'
				},
				{
					id: 'n2',
					client_id: 'c1',
					status: 'draft',
					type: 'shift',
					author_name: 'Test Staff',
					updated_at: '2026-10-15T14:00:00Z'
				}
			]
		});
		expect(items.map((i) => [i.urgency, i.kind, i.id])).toEqual([
			['critical', 'incident', 'i1'],
			['critical', 'health', 'h1'],
			['critical', 'dose', 'd2'],
			['action', 'coverage', 'k1'],
			['action', 'dose', 'd1'],
			['action', 'note', 'n1'],
			['action', 'clock', 'cl1'],
			['info', 'coverage', 'k2'],
			['info', 'incident', 'i2']
		]);
		const byId = Object.fromEntries(items.map((i) => [i.id, i]));
		expect(byId.h1.title).toBe('Temperature outside the normal range');
		expect(byId.d1.title).toBe('Test med refused');
		expect(byId.d1.detail).toBe('Spat it out');
		expect(byId.d2.title).toBe('Medication may have been recorded twice');
		expect(byId.i1.title).toBe('Fall, high severity');
		expect(byId.cl1.title).toBe('Test Staff clocked in outside the check-in area');
		expect(byId.n1.pill).toBe('Review');
	});

	it('turns unchecked required contacts into an action item', () => {
		const [item] = attentionItems({
			...empty,
			incidents: [
				{
					id: 'i1',
					client_id: 'c1',
					type: 'Injury',
					severity: 'Low',
					status: 'open',
					notified_parties: '[]',
					occurred_at: '2026-10-15T12:00:00Z'
				}
			]
		});
		expect(item.urgency).toBe('action');
		expect(item.detail).toBe('Not yet marked as told: Family or guardian, Nurse');
	});
});

describe('goal milestones (frontend-spec-3.md §13 item 40)', () => {
	it('celebrate two or more trials that were all Independent', () => {
		expect(goalMilestone(['Independent', 'Independent'])).toBe(true);
		expect(goalMilestone(['Independent'])).toBe(false);
		expect(goalMilestone(['Independent', 'Refused', 'Independent'])).toBe(false);
		expect(goalMilestone([])).toBe(false);
	});
});
