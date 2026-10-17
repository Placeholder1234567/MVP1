import { describe, expect, it } from 'vitest';
import { doseAlerts, localInstant, type HomeMed } from '../../../src/lib/domain/med-reminders';

const TZ = 'America/New_York';
const oak = 'home-oak',
	elm = 'home-elm';
const meds: HomeMed[] = [
	{ id: 'a', homeId: oak, scheduled_times: ['08:00', '20:00'] },
	{ id: 'b', homeId: oak, scheduled_times: ['08:00:00'] },
	{ id: 'c', homeId: elm, scheduled_times: ['08:00'] },
	{ id: 'prn', homeId: oak, scheduled_times: [] }
];

describe('localInstant', () => {
	it('turns a local day and time into the right instant', () => {
		expect(localInstant('2026-10-16', '08:00', TZ).toISOString()).toBe('2026-10-16T12:00:00.000Z');
		expect(localInstant('2026-12-16', '08:00', TZ).toISOString()).toBe('2026-12-16T13:00:00.000Z');
		expect(localInstant('2026-10-16', '23:30', 'UTC').toISOString()).toBe(
			'2026-10-16T23:30:00.000Z'
		);
	});
	it('handles the day daylight saving ends', () => {
		// 2026-11-01: clocks go back at 02:00 EDT; 08:00 is EST.
		expect(localInstant('2026-11-01', '08:00', TZ).toISOString()).toBe('2026-11-01T13:00:00.000Z');
	});
});

describe('doseAlerts', () => {
	it('reminds each home once for doses due within 30 minutes', () => {
		const { due, overdue } = doseAlerts(meds, [], new Date('2026-10-16T11:40:00Z'), TZ);
		expect(overdue).toEqual([]);
		expect(due.map((d) => [d.homeId, d.day, d.time, d.medicationIds.sort()])).toEqual([
			[elm, '2026-10-16', '08:00', ['c']],
			[oak, '2026-10-16', '08:00', ['a', 'b']]
		]);
	});

	it('says nothing before the lead time or between due and overdue', () => {
		expect(doseAlerts(meds, [], new Date('2026-10-16T11:20:00Z'), TZ)).toEqual({
			due: [],
			overdue: []
		});
		expect(doseAlerts(meds, [], new Date('2026-10-16T12:10:00Z'), TZ)).toEqual({
			due: [],
			overdue: []
		});
	});

	it('flags doses with no record 30 to 120 minutes late', () => {
		const records = [
			{ medication_id: 'a', day: '2026-10-16', scheduled_time: '08:00:00', is_prn: false }
		];
		const at = (iso: string) => doseAlerts(meds, records, new Date(iso), TZ).overdue;
		expect(at('2026-10-16T12:35:00Z').map((d) => [d.homeId, d.medicationIds])).toEqual([
			[elm, ['c']],
			[oak, ['b']]
		]);
		expect(at('2026-10-16T14:05:00Z')).toEqual([]);
	});

	it('treats a refused or held dose as recorded, but not an amendment alone', () => {
		const records = [
			{ medication_id: 'a', day: '2026-10-16', scheduled_time: '08:00', is_prn: false },
			{ medication_id: 'b', day: '2026-10-16', scheduled_time: '08:00', is_prn: false },
			{
				medication_id: 'c',
				day: '2026-10-16',
				scheduled_time: '08:00',
				is_prn: false,
				amends_id: 'x'
			}
		];
		const { overdue } = doseAlerts(meds, records, new Date('2026-10-16T12:45:00Z'), TZ);
		expect(overdue.map((d) => d.homeId)).toEqual([elm]);
	});

	it('looks across midnight', () => {
		const late: HomeMed[] = [{ id: 'n', homeId: oak, scheduled_times: ['00:10'] }];
		// 23:50 local on the 16th: the 00:10 dose on the 17th is due.
		const { due } = doseAlerts(late, [], new Date('2026-10-17T03:50:00Z'), TZ);
		expect(due.map((d) => d.day)).toEqual(['2026-10-17']);
	});

	it('skips medications stopped or not yet started', () => {
		const now = new Date('2026-10-16T11:40:00Z');
		const changed: HomeMed[] = [
			{ id: 's', homeId: oak, scheduled_times: ['08:00'], stopped_at: '2026-10-16T11:00:00Z' },
			{ id: 'n', homeId: oak, scheduled_times: ['08:00'], started_at: '2026-10-16T13:00:00Z' }
		];
		expect(doseAlerts(changed, [], now, TZ).due).toEqual([]);
	});
});
