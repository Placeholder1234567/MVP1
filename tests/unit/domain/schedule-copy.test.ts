import { describe, expect, it } from 'vitest';
import { planWeekCopy, type WeekSlot } from '../../../src/lib/domain/schedule-copy';

const slot = (
	day: string,
	shift: WeekSlot['shift'],
	assignedTo: string | null,
	status = 'filled'
) => ({
	day,
	shift,
	assignedTo,
	status: assignedTo ? status : 'open'
});
const never = () => false;

describe('copy last week (frontend-audit.md finding 17)', () => {
	it('moves each assignment to the same weekday and shift a week later', () => {
		const plan = planWeekCopy(
			[
				slot('2026-03-02', 'am', 'a'),
				slot('2026-03-08', 'on', 'b'),
				slot('2026-03-03', 'pm', null)
			],
			[],
			'2026-03-02',
			'2026-03-09',
			never
		);
		expect(plan.copy).toEqual([
			{ day: '2026-03-09', shift: 'am', profileId: 'a' },
			{ day: '2026-03-15', shift: 'on', profileId: 'b' }
		]);
		expect(plan.skipped).toEqual([]);
	});

	it('leaves assigned, covering and started slots alone', () => {
		const plan = planWeekCopy(
			[slot('2026-03-02', 'am', 'a'), slot('2026-03-02', 'pm', 'b'), slot('2026-03-03', 'am', 'c')],
			[
				slot('2026-03-09', 'am', 'z'),
				{ day: '2026-03-09', shift: 'pm', assignedTo: null, status: 'filling' }
			],
			'2026-03-02',
			'2026-03-09',
			(day, shift) => day === '2026-03-10' && shift === 'am'
		);
		expect(plan.copy).toEqual([]);
		expect(plan.skipped.map((s) => s.reason)).toEqual([
			'already-assigned',
			'finding-cover',
			'started'
		]);
	});
});
