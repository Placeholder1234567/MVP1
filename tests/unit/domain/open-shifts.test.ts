import { describe, expect, it } from 'vitest';
import { openShiftCount } from '../../../src/lib/domain/shifts';
describe('openShiftCount', () => {
	const slot = (day: string, shift: string, assigned_to: string | null, home_id = 'h1') => ({
		home_id,
		day,
		shift,
		assigned_to
	});
	it('counts unassigned shifts at the home that have not ended', () => {
		const at = new Date('2026-10-18T16:00:00Z'); // evening of Oct 18, UTC
		expect(
			openShiftCount(
				[
					slot('2026-10-18', 'am', null), // ended
					slot('2026-10-18', 'pm', null), // running now
					slot('2026-10-19', 'am', null),
					slot('2026-10-19', 'pm', 'cara'), // filled
					slot('2026-10-19', 'on', null, 'h2') // another home
				],
				'h1',
				at,
				'UTC'
			)
		).toBe(2);
	});
});
