import { describe, expect, it } from 'vitest';
import { checkPicks, suggestShifts } from '../../../src/lib/domain/schedule-suggest';

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
		// "a" already has five 8-hour shifts this week (Sunday 18th to Saturday 24th).
		const scheduled = ['18', '20', '21', '22', '23'].map((d) => ({
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

describe('checkPicks', () => {
	const pick = (day: string, shift: 'am' | 'pm' | 'on', profileId: string) => ({
		day,
		shift,
		profileId
	});
	it('refuses a pick for someone now working that day', () => {
		const r = checkPicks(
			[pick('2026-10-19', 'am', 'a'), pick('2026-10-20', 'am', 'a')],
			[staff('a')],
			[{ profileId: 'a', day: '2026-10-19' }],
			HOME,
			[]
		);
		expect(r.ok.map((p) => p.day)).toEqual(['2026-10-20']);
		expect(r.refused.map((p) => p.day)).toEqual(['2026-10-19']);
	});
	it('counts the picks it accepts, so two on one day or a sixth shift are refused', () => {
		const week = ['19', '20', '21', '22', '23', '24'].map((d) => pick(`2026-10-${d}`, 'am', 'a'));
		const r = checkPicks([pick('2026-10-19', 'pm', 'a'), ...week], [staff('a')], [], HOME, []);
		// Monday AM first (shift order), so Monday PM is the same day; Saturday is the sixth shift.
		expect(r.ok.map((p) => `${p.day} ${p.shift}`)).toEqual([
			'2026-10-19 am',
			'2026-10-20 am',
			'2026-10-21 am',
			'2026-10-22 am',
			'2026-10-23 am'
		]);
		expect(r.refused.map((p) => `${p.day} ${p.shift}`)).toEqual(['2026-10-19 pm', '2026-10-24 am']);
	});
	it('refuses unknown, inactive or uncertified staff when doses are due', () => {
		const r = checkPicks(
			[
				pick('2026-10-19', 'am', 'ghost'),
				pick('2026-10-20', 'am', 'gone'),
				pick('2026-10-21', 'am', 'nomed')
			],
			[staff('gone', { active: false }), staff('nomed', { med: false })],
			[],
			HOME,
			['08:00']
		);
		expect(r.ok).toEqual([]);
		expect(r.refused).toHaveLength(3);
	});
});

describe('overnight shifts', () => {
	it('never suggests the AM shift right after someone’s overnight, or the overnight before their AM', () => {
		const s = suggestShifts(
			[open('2026-10-20', 'am'), open('2026-10-21', 'on')],
			[staff('a'), staff('b')],
			[
				{ profileId: 'a', day: '2026-10-19', shift: 'on' },
				{ profileId: 'b', day: '2026-10-22', shift: 'am' }
			],
			HOME
		);
		expect(s.map((x) => x.profileId)).toEqual(['b', 'a']);
	});
	it('counts only the shifts in the week of the open shift', () => {
		// Five shifts the week before do not count toward this week's 40 hours.
		const scheduled = ['12', '13', '14', '15', '16'].map((d) => ({
			profileId: 'a',
			day: `2026-10-${d}`
		}));
		const s = suggestShifts([open('2026-10-19', 'pm')], [staff('a')], scheduled, HOME);
		expect(s[0].profileId).toBe('a');
	});
	it('re-checks kept picks against overnight shifts too', () => {
		const { ok, refused } = checkPicks(
			[
				{ day: '2026-10-19', shift: 'on' as const, profileId: 'a' },
				{ day: '2026-10-20', shift: 'am' as const, profileId: 'a' }
			],
			[staff('a')],
			[],
			HOME,
			[]
		);
		expect(ok.map((p) => p.day)).toEqual(['2026-10-19']);
		expect(refused.map((p) => p.day)).toEqual(['2026-10-20']);
	});
});
