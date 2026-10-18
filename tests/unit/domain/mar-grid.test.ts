import { describe, expect, it } from 'vitest';
import {
	compliance,
	complianceBand,
	marGrid,
	weekDays,
	type GridMed,
	type GridRecord
} from '../../../src/lib/domain/mar-grid';

const days = weekDays('2026-03-01'); // Sun 1 .. Sat 7
const now = { day: '2026-03-04', time: '12:00' };
const toDay = (iso: string) => iso.slice(0, 10);

const meds: GridMed[] = [
	{ id: 'm1', name: 'Synthetic B', dose: '1 tablet', scheduled_times: ['08:00', '20:00'] },
	{ id: 'm2', name: 'Synthetic A', dose: '5 ml', scheduled_times: ['08:00:00'] },
	{ id: 'prn', name: 'Synthetic PRN', dose: '1 tablet', scheduled_times: [] }
];
let n = 0;
const rec = (r: Partial<GridRecord>): GridRecord => ({
	id: `r${++n}`,
	medication_id: 'm1',
	day: '2026-03-01',
	scheduled_time: '08:00:00',
	status: 'given',
	is_prn: false,
	amends_id: null,
	conflict_with: null,
	recorded_at: '2026-03-01T08:05:00Z',
	...r
});

describe('marGrid', () => {
	it('has a row per medication and dose time, sorted by name', () => {
		const rows = marGrid(meds, [], days, now, toDay);
		expect(rows.map((r) => [r.name, r.time])).toEqual([
			['Synthetic A', '08:00'],
			['Synthetic B', '08:00'],
			['Synthetic B', '20:00'],
			['Synthetic PRN', null]
		]);
	});

	it('marks past doses missing and later ones upcoming', () => {
		const row = marGrid(meds, [], days, now, toDay).find((r) => r.name === 'Synthetic A')!;
		expect(row.cells.map((c) => c.kind)).toEqual([
			'missing',
			'missing',
			'missing',
			'missing', // today 08:00 has passed at 12:00
			'upcoming',
			'upcoming',
			'upcoming'
		]);
		const evening = marGrid(meds, [], days, now, toDay).find((r) => r.time === '20:00')!;
		expect(evening.cells[3].kind).toBe('upcoming');
	});

	it('shows recorded status, the latest correction and offline duplicates', () => {
		const original = rec({ status: 'given' });
		const records = [
			original,
			rec({ amends_id: original.id, status: 'held', recorded_at: '2026-03-01T09:00:00Z' }),
			rec({ day: '2026-03-02', status: 'refused' }),
			rec({ day: '2026-03-03' }),
			rec({ day: '2026-03-03', conflict_with: 'x' })
		];
		const row = marGrid(meds, records, days, now, toDay).find(
			(r) => r.medicationId === 'm1' && r.time === '08:00'
		)!;
		expect(row.cells.slice(0, 3)).toEqual([
			{ kind: 'held', corrected: true, conflict: false },
			{ kind: 'refused', corrected: false, conflict: false },
			{ kind: 'given', corrected: false, conflict: true }
		]);
	});

	it('counts as-needed doses per day', () => {
		const records = [
			rec({ medication_id: 'prn', is_prn: true, scheduled_time: null, day: '2026-03-02' }),
			rec({ medication_id: 'prn', is_prn: true, scheduled_time: null, day: '2026-03-02' })
		];
		const row = marGrid(meds, records, days, now, toDay).find((r) => r.time === null)!;
		expect(row.cells[1]).toEqual({ kind: 'prn', count: 2 });
		expect(row.cells[0]).toEqual({ kind: 'prn', count: 0 });
	});

	it('leaves days before a start or after a stop unscheduled, and drops rows with nothing in the week', () => {
		const changed: GridMed[] = [
			{
				id: 's',
				name: 'Started midweek',
				dose: '',
				scheduled_times: ['08:00'],
				started_at: '2026-03-03T10:00:00Z',
				stopped_at: '2026-03-05T10:00:00Z'
			},
			{
				id: 'old',
				name: 'Stopped before',
				dose: '',
				scheduled_times: ['08:00'],
				stopped_at: '2026-02-01T10:00:00Z'
			}
		];
		const rows = marGrid(changed, [], days, now, toDay);
		expect(rows).toHaveLength(1);
		expect(rows[0].cells.map((c) => c.kind)).toEqual([
			'na',
			'na',
			'missing',
			'missing',
			'upcoming',
			'na',
			'na'
		]);
	});
});

describe('compliance', () => {
	it('is the share of due doses given, ignoring upcoming and unscheduled', () => {
		const rows = marGrid(
			[meds[1]],
			[
				rec({ medication_id: 'm2', day: '2026-03-01' }),
				rec({ medication_id: 'm2', day: '2026-03-02', status: 'refused' })
			],
			days,
			now,
			toDay
		);
		expect(compliance(rows)).toEqual({ given: 1, due: 4, percent: 25 });
		expect(compliance([])).toEqual({ given: 0, due: 0, percent: null });
	});

	it('bands at 95 and 90 percent', () => {
		expect([100, 95, 94, 90, 89].map(complianceBand)).toEqual([
			'ok',
			'ok',
			'caution',
			'caution',
			'bad'
		]);
	});
});
