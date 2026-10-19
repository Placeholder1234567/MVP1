import { describe, expect, it } from 'vitest';
import {
	DEFAULT_CONTROLLED_RULES,
	STATE_PRESETS,
	canWitness,
	countDue,
	countEntryError,
	countPeriodStart,
	countersignOverdue,
	expectedOnHand,
	givenDoseTimes,
	isDiscrepancy,
	parseControlledRules
} from '../../../src/lib/domain/controlled';

const NY_TZ = 'America/New_York';
const dose = (id: string, at: string, status = 'given', extra: object = {}) => ({
	id,
	status,
	recorded_at: at,
	amends_id: null,
	conflict_with: null,
	...extra
});

describe('parseControlledRules', () => {
	it('defaults to two-person shift counts with everything witnessed', () => {
		expect(parseControlledRules({})).toEqual(DEFAULT_CONTROLLED_RULES);
		expect(DEFAULT_CONTROLLED_RULES).toMatchObject({
			countEvery: 'shift',
			witness: { receipt: true, count: true, waste: true, disposal: true },
			witnessQualification: 'med_certified'
		});
	});

	it('starts from the state preset and keeps valid overrides only', () => {
		const r = parseControlledRules(
			JSON.stringify({
				controlled_rules: {
					state: 'CA',
					countEvery: 'day',
					witness: { receipt: false, count: 'yes' },
					countersignHours: 500
				}
			})
		);
		expect(r).toEqual({
			...STATE_PRESETS.CA.rules,
			countEvery: 'day',
			witness: { ...STATE_PRESETS.CA.rules.witness, receipt: false }
		});
		expect(r.witnessQualification).toBe('any_staff');
	});
});

describe('canWitness', () => {
	it('never the recorder or an inactive person; certification per the rules', () => {
		const ny = STATE_PRESETS.NY.rules;
		const ca = STATE_PRESETS.CA.rules;
		const uncertified = { id: 'b', active: 1, med_certified: 0 };
		expect(canWitness(ny, { id: 'a', active: 1, med_certified: 1 }, 'a')).toBe(false);
		expect(canWitness(ny, { id: 'b', active: 0, med_certified: 1 }, 'a')).toBe(false);
		expect(canWitness(ny, uncertified, 'a')).toBe(false);
		expect(canWitness(ca, uncertified, 'a')).toBe(true);
	});
});

describe('expectedOnHand', () => {
	const entries = [
		{ kind: 'receipt', quantity: 30, recorded_at: '2026-10-01T12:00:00Z' },
		{ kind: 'count', quantity: 28, recorded_at: '2026-10-02T11:00:00Z' },
		{ kind: 'receipt', quantity: 10, recorded_at: '2026-10-02T13:00:00Z' },
		{ kind: 'waste', quantity: 1, recorded_at: '2026-10-02T14:00:00Z' }
	];
	it('starts from the last count and applies receipts, waste and given doses after it', () => {
		const doses = [
			dose('before', '2026-10-02T10:00:00Z'),
			dose('a', '2026-10-02T15:00:00Z'),
			dose('b', '2026-10-02T21:00:00Z'),
			dose('refused', '2026-10-02T22:00:00Z', 'refused')
		];
		expect(expectedOnHand(entries, doses, 1)).toEqual({
			expected: 35,
			lastCount: '2026-10-02T11:00:00Z'
		});
		expect(expectedOnHand(entries, doses, 2).expected).toBe(33);
	});

	it('starts at zero before the first count', () => {
		expect(expectedOnHand(entries.slice(0, 1), [], 1)).toEqual({ expected: 30, lastCount: null });
	});
});

describe('givenDoseTimes', () => {
	it('follows corrections and skips duplicate conflict records', () => {
		const doses = [
			dose('given-then-refused', '2026-10-02T15:00:00Z'),
			dose('fix', '2026-10-02T18:00:00Z', 'refused', { amends_id: 'given-then-refused' }),
			dose('held-then-given', '2026-10-02T16:00:00Z', 'held'),
			dose('fix2', '2026-10-02T19:00:00Z', 'given', { amends_id: 'held-then-given' }),
			dose('dup', '2026-10-02T16:05:00Z', 'given', { conflict_with: 'x' })
		];
		expect(givenDoseTimes(doses)).toEqual(['2026-10-02T16:00:00Z']);
	});
});

describe('count periods', () => {
	it('uses the 07, 15 and 23 shift starts in the agency time zone', () => {
		// 16:30 EDT -> 15:00 EDT; 02:00 EDT -> 23:00 the evening before
		expect(countPeriodStart(new Date('2026-10-02T20:30:00Z'), NY_TZ, 'shift').toISOString()).toBe(
			'2026-10-02T19:00:00.000Z'
		);
		expect(countPeriodStart(new Date('2026-10-03T06:00:00Z'), NY_TZ, 'shift').toISOString()).toBe(
			'2026-10-03T03:00:00.000Z'
		);
		expect(countPeriodStart(new Date('2026-10-02T20:30:00Z'), NY_TZ, 'day').toISOString()).toBe(
			'2026-10-02T04:00:00.000Z'
		);
	});

	it('a witnessed (or pending) count this shift satisfies it', () => {
		const now = new Date('2026-10-02T20:30:00Z');
		const rules = DEFAULT_CONTROLLED_RULES;
		const count = (at: string, witness_status: string) => ({
			kind: 'count',
			quantity: 1,
			recorded_at: at,
			witness_status
		});
		expect(countDue([], now, NY_TZ, rules)).toBe(true);
		expect(countDue([count('2026-10-02T18:00:00Z', 'verified')], now, NY_TZ, rules)).toBe(true);
		expect(countDue([count('2026-10-02T19:30:00Z', 'none')], now, NY_TZ, rules)).toBe(true);
		expect(countDue([count('2026-10-02T19:30:00Z', 'pending')], now, NY_TZ, rules)).toBe(false);
	});
});

describe('entries', () => {
	it('explains what is missing', () => {
		const base = {
			kind: 'waste',
			quantity: 1,
			reason: 'Dropped',
			needsWitness: true,
			witnessId: 'w'
		};
		expect(countEntryError(base)).toBeNull();
		expect(countEntryError({ ...base, reason: '' })).toMatch(/why it was wasted/);
		expect(countEntryError({ ...base, witnessId: null })).toMatch(/witnessed/);
		expect(countEntryError({ ...base, quantity: 0 })).toMatch(/above zero/);
		expect(countEntryError({ ...base, kind: 'count', quantity: 0, reason: null })).toBeNull();
		expect(countEntryError({ ...base, quantity: Number.NaN })).toMatch(/number/);
	});

	it('flags count discrepancies and overdue countersigns', () => {
		expect(isDiscrepancy(27, 28)).toBe(true);
		expect(isDiscrepancy(27.5, 27.5)).toBe(false);
		const e = { witness_status: 'pending', recorded_at: '2026-10-01T00:00:00Z' };
		expect(countersignOverdue(e, DEFAULT_CONTROLLED_RULES, new Date('2026-10-01T23:00:00Z'))).toBe(
			false
		);
		expect(countersignOverdue(e, DEFAULT_CONTROLLED_RULES, new Date('2026-10-02T01:00:00Z'))).toBe(
			true
		);
	});
});

describe('state presets', () => {
	it('each preset names its own state and survives a save and load', () => {
		for (const [code, preset] of Object.entries(STATE_PRESETS)) {
			expect(preset.rules.state).toBe(code);
			expect(preset.note.length).toBeGreaterThan(20);
			expect(parseControlledRules({ controlled_rules: preset.rules })).toEqual(preset.rules);
		}
	});

	it('Massachusetts asks for certified witnesses; Florida lets any staff witness', () => {
		expect(parseControlledRules({ controlled_rules: { state: 'MA' } }).witnessQualification).toBe(
			'med_certified'
		);
		expect(parseControlledRules({ controlled_rules: { state: 'FL' } }).witnessQualification).toBe(
			'any_staff'
		);
	});
});
