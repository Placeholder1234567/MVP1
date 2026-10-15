import { describe, expect, it } from 'vitest';
import { doseSlots, dosesDue, medTimes, parseTimes } from '../../../src/lib/domain';

describe('parseTimes', () => {
	it('reads 12- and 24-hour times, sorted and de-duplicated', () => {
		expect(parseTimes('8am, 8:30pm, 20:00')).toEqual(['08:00', '20:00', '20:30']);
		expect(parseTimes('12am; 12pm')).toEqual(['00:00', '12:00']);
		expect(parseTimes('8am, 08:00')).toEqual(['08:00']);
		expect(parseTimes('')).toEqual([]);
	});

	it('rejects anything it cannot read', () => {
		expect(parseTimes('8am, later')).toBeNull();
		expect(parseTimes('13pm')).toBeNull();
		expect(parseTimes('24:00')).toBeNull();
		expect(parseTimes('8:75')).toBeNull();
	});
});

const twiceDaily = { id: 'm1', scheduled_times: ['20:00:00', '08:00:00'] };
const morning = { id: 'm2', scheduled_times: ['08:00'] };
const prn = { id: 'm3', scheduled_times: [] };
const stopped = { id: 'm4', scheduled_times: ['12:00'], stopped_at: '2026-10-01T00:00:00Z' };
const at = new Date('2026-10-13T12:00:00Z');

describe('doseSlots', () => {
	it('lists every scheduled dose in time order, skipping PRN and stopped meds', () => {
		expect(medTimes(twiceDaily)).toEqual(['08:00', '20:00']);
		expect(doseSlots([twiceDaily, morning, prn, stopped], at)).toEqual([
			{ medicationId: 'm1', time: '08:00' },
			{ medicationId: 'm2', time: '08:00' },
			{ medicationId: 'm1', time: '20:00' }
		]);
	});
});

describe('dosesDue', () => {
	const day = '2026-10-13';
	const base = { medication_id: 'm1', day, is_prn: false };

	it('the morning record does not close the evening dose (the MVP twice-daily bug)', () => {
		const records = [{ ...base, scheduled_time: '08:00:00' }];
		expect(dosesDue([twiceDaily], records, day, at)).toEqual([
			{ medicationId: 'm1', time: '20:00' }
		]);
	});

	it('amendments and conflict copies neither open nor close a slot', () => {
		const records = [
			{ ...base, scheduled_time: '20:00', amends_id: 'x' },
			{ ...base, scheduled_time: '20:00', conflict_with: 'y' }
		];
		expect(dosesDue([twiceDaily], records, day, at).map((d) => d.time)).toEqual(['08:00', '20:00']);
	});

	it('ignores PRN records and other days', () => {
		const records = [
			{ ...base, scheduled_time: '08:00', is_prn: true },
			{ ...base, scheduled_time: '08:00', day: '2026-10-12' }
		];
		expect(dosesDue([twiceDaily], records, day, at)).toHaveLength(2);
	});
});
