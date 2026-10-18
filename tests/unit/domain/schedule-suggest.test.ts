import { describe, expect, it } from 'vitest';
import { suggestShifts } from '../../../src/lib/domain/schedule-suggest';

const HOME = 'oak';
const staff = (
	id: string,
	extra: Partial<{ med: boolean; homes: string[]; active: boolean }> = {}
) => ({
	id,
	home_ids: extra.homes ?? [HOME],
	med_certified: extra.med ?? true,
	active: extra.active ?? true
});
const open = (day: string, shift: 'am' | 'pm' | 'on', doseTimes: string[] = []) => ({
	day,
	shift,
	doseTimes
});

describe('suggestShifts', () => {
	it('spreads shifts across eligible staff and never books anyone twice in a day', () => {
		const s = suggestShifts(
			[open('2026-10-19', 'am'), open('2026-10-19', 'pm'), open('2026-10-20', 'am')],
			[staff('a'), staff('b')],
			[],
			HOME
		);
		expect(s.map((x) => x.profileId)).toEqual(['a', 'b', 'a']);
	});

	it('counts existing assignments and keeps everyone under 40 hours', () => {
		// "a" already has five 8-hour shifts this week.
		const scheduled = ['13', '14', '15', '16', '17'].map((d) => ({
			profileId: 'a',
			day: `2026-10-${d}`
		}));
		const s = suggestShifts([open('2026-10-19', 'am')], [staff('a')], scheduled, HOME);
		expect(s).toEqual([
			{ day: '2026-10-19', shift: 'am', profileId: null, reason: 'over_40_hours' }
		]);
	});

	it('needs a med-certified person when a dose falls in the shift', () => {
		const s = suggestShifts(
			[open('2026-10-19', 'am', ['08:00']), open('2026-10-19', 'pm', ['08:00'])],
			[staff('uncertified', { med: false }), staff('certified')],
			[],
			HOME
		);
		expect(s.map((x) => x.profileId)).toEqual(['certified', 'uncertified']);
	});

	it('suggests nobody from another home or who is inactive', () => {
		const s = suggestShifts(
			[open('2026-10-19', 'on')],
			[staff('maple', { homes: ['maple'] }), staff('gone', { active: false })],
			[],
			HOME
		);
		expect(s[0]).toMatchObject({ profileId: null, reason: 'not_trained_at_home' });
	});
});
