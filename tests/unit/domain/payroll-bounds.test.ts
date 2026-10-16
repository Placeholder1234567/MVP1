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
