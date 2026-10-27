import { expect, it, vi } from 'vitest';
import type { Tx } from '../../../src/lib/server/db';
import type { CurrentUser } from '../../../src/lib/server/services/auth';

const { clockRows } = vi.hoisted(() => ({ clockRows: vi.fn() }));
vi.mock('../../../src/lib/server/services/clock/clock.queries', () => ({ clockRows }));
vi.mock('../../../src/lib/server/services/notification/index.ts', () => ({}));
import { timesheet } from '../../../src/lib/server/services/clock';

const user = { role: 'supervisor', agencyId: 'agency' } as CurrentUser;
const tx = {} as Tx;
const range = { from: new Date('2026-01-01T00:00:00Z'), to: new Date('2026-01-02T00:00:00Z') };

it('rejects invalid dates, reversed, empty and oversized periods before querying', async () => {
	clockRows.mockClear();
	for (const to of [new Date(NaN), range.from, new Date('2025-01-01'), new Date('2028-01-01')])
		await expect(timesheet(tx, user, { ...range, to })).rejects.toMatchObject({
			code: 'VALIDATION_FAILED'
		});
	expect(clockRows).not.toHaveBeenCalled();
});

it('rejects results above the row cap instead of silently producing partial payroll', async () => {
	clockRows.mockResolvedValue(Array(5001).fill({}));
	await expect(timesheet(tx, user, range)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
	expect(clockRows).toHaveBeenLastCalledWith(tx, 'agency', {
		...range,
		overlap: true,
		limit: 5001
	});
});

it('clips crossing shifts and excludes open shifts from hours', async () => {
	clockRows.mockResolvedValue([
		{
			clock_in_at: new Date('2025-12-31T23:00:00Z'),
			clock_out_at: new Date('2026-01-01T02:00:00Z'),
			verified: true,
			manual_override: false
		},
		{
			clock_in_at: new Date('2026-01-01T23:00:00Z'),
			clock_out_at: new Date('2026-01-02T02:00:00Z'),
			verified: false,
			manual_override: true
		},
		{ clock_in_at: range.from, clock_out_at: null, verified: false, manual_override: false }
	]);
	expect(await timesheet(tx, user, range)).toMatchObject({
		totalHours: 3,
		verifiedHours: 2,
		manualHours: 1,
		unverifiedHours: 0
	});
});

// Explicit offsets freeze instants without choosing a browser/agency timezone policy.
it.each([
	{
		name: 'spring-forward overnight',
		from: '2026-03-07T23:00:00-05:00',
		to: '2026-03-08T07:00:00-04:00',
		before: '2026-03-07T22:00:00-05:00',
		after: '2026-03-08T08:00:00-04:00',
		manualIn: '2026-03-08T01:30:00-05:00',
		manualOut: '2026-03-08T03:30:00-04:00',
		lateIn: '2026-03-08T06:30:00-04:00',
		verifiedHours: 7
	},
	{
		name: 'fall-back overnight',
		from: '2026-10-31T23:00:00-04:00',
		to: '2026-11-01T07:00:00-05:00',
		before: '2026-10-31T22:00:00-04:00',
		after: '2026-11-01T08:00:00-05:00',
		manualIn: '2026-11-01T01:30:00-04:00',
		manualOut: '2026-11-01T01:30:00-05:00',
		lateIn: '2026-11-01T06:30:00-05:00',
		verifiedHours: 9
	}
])('clips $name by elapsed time while preserving payroll categories', async (scenario) => {
	const period = { from: new Date(scenario.from), to: new Date(scenario.to) };
	const rows = [
		{
			profile_id: 'verified-staff',
			clock_in_at: new Date(scenario.before),
			clock_out_at: new Date(scenario.after),
			verified: true,
			manual_override: false
		},
		{
			profile_id: 'manual-staff',
			clock_in_at: new Date(scenario.manualIn),
			clock_out_at: new Date(scenario.manualOut),
			verified: true,
			manual_override: true
		},
		{
			profile_id: 'unverified-staff',
			clock_in_at: new Date(scenario.lateIn),
			clock_out_at: new Date(scenario.after),
			verified: false,
			manual_override: false
		},
		{
			profile_id: 'open-staff',
			clock_in_at: period.from,
			clock_out_at: null,
			verified: true,
			manual_override: false
		}
	];
	const originalRows = structuredClone(rows);
	clockRows.mockResolvedValue(rows);
	const result = await timesheet(tx, user, period);
	expect(result).toMatchObject({
		totalHours: scenario.verifiedHours + 1.5,
		verifiedHours: scenario.verifiedHours,
		manualHours: 1,
		unverifiedHours: 0.5
	});
	expect(clockRows).toHaveBeenLastCalledWith(tx, 'agency', {
		...period,
		overlap: true,
		limit: 5001
	});
	expect(result.entries).toEqual(originalRows);
});
it('keeps both occurrences of a repeated hour distinct when the report itself crosses the offset change', async () => {
	const period = {
		from: new Date('2026-11-01T01:30:00-04:00'),
		to: new Date('2026-11-01T01:30:00-05:00')
	};
	clockRows.mockResolvedValue([
		{
			clock_in_at: new Date('2026-11-01T01:15:00-04:00'),
			clock_out_at: new Date('2026-11-01T01:45:00-05:00'),
			verified: true,
			manual_override: false
		}
	]);
	expect(await timesheet(tx, user, period)).toMatchObject({
		totalHours: 1,
		verifiedHours: 1,
		manualHours: 0,
		unverifiedHours: 0
	});
	expect(clockRows).toHaveBeenLastCalledWith(tx, 'agency', {
		...period,
		overlap: true,
		limit: 5001
	});
});
