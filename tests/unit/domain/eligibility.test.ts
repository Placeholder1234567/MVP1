import { describe, expect, it } from 'vitest';
import { eligibility, medsDueDuring, type Candidate } from '../../../src/lib/domain';

const OAK = 'oak';
const person = (id: string, over: Partial<Candidate> = {}): Candidate => ({
	id,
	home_ids: [OAK],
	med_certified: true,
	active: true,
	...over
});

const base = {
	homeId: OAK,
	shift: 'pm' as const,
	doseTimes: ['20:00'],
	workingThatDay: new Set<string>(),
	weeklyShifts: new Map<string, number>()
};

describe('eligibility', () => {
	it('gives the same reasons, in the same order, as the MVP', () => {
		const staff = [
			person('caller'),
			person('other-home', { home_ids: ['maple'] }),
			person('busy'),
			person('full-week'),
			person('no-cert', { med_certified: false }),
			person('ok')
		];
		const result = eligibility(staff, {
			...base,
			excludeId: 'caller',
			workingThatDay: new Set(['busy']),
			weeklyShifts: new Map([['full-week', 5]])
		});
		expect(result.map((r) => [r.id, r.reason])).toEqual([
			['caller', 'called_out'],
			['other-home', 'not_trained_at_home'],
			['busy', 'already_working'],
			['full-week', 'over_40_hours'],
			['no-cert', 'not_med_certified'],
			['ok', null]
		]);
	});

	it('four shifts in the week still allows a fifth (exactly 40 hours)', () => {
		const [r] = eligibility([person('a')], { ...base, weeklyShifts: new Map([['a', 4]]) });
		expect(r.eligible).toBe(true);
	});

	it('skips deactivated staff', () => {
		expect(eligibility([person('gone', { active: false })], base)[0].reason).toBe('inactive');
	});

	// Change from the MVP, which only required certification on the evening shift.
	it('requires med certification when a dose falls inside the shift', () => {
		expect(medsDueDuring('am', ['08:00', '20:00'])).toBe(true);
		expect(medsDueDuring('on', ['08:00', '20:00'])).toBe(false);
		const noCert = person('n', { med_certified: false });
		expect(eligibility([noCert], { ...base, shift: 'am', doseTimes: ['08:00'] })[0].reason).toBe(
			'not_med_certified'
		);
		expect(eligibility([noCert], { ...base, shift: 'on', doseTimes: ['08:00'] })[0].eligible).toBe(
			true
		);
	});
});
