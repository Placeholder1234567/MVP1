import { describe, expect, it } from 'vitest';
import { healthWatch, keywordSignals, watchSummary } from '../../../src/lib/domain/health-watch';

const now = new Date('2026-10-18T12:00:00Z');
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

describe('health watch (charting-guide.md §3c)', () => {
	it('finds each condition once per text and quotes the sentence', () => {
		const s = keywordSignals(
			'Ate lunch slowly. Coughing during meals again and choked once. Later he vomited.',
			daysAgo(1)
		);
		expect(s.map((x) => x.condition)).toEqual(['aspiration', 'gerd']);
		expect(s[0].reason).toBe('“Coughing during meals again and choked once.”');
	});

	it('skips negated mentions', () => {
		expect(
			keywordSignals('No choking at dinner. Did not vomit. Denies heartburn.', daysAgo(1))
		).toEqual([]);
		expect(
			keywordSignals('No problems today, but she choked on a grape.', daysAgo(1))
		).toHaveLength(1);
	});

	it('flags tracked people with no bowel movement for three days', () => {
		const health = [
			{ at: daysAgo(5), kind: 'bowel', data: { status: 'Observed' } },
			{ at: daysAgo(2), kind: 'bowel', data: { status: 'Not observed' } }
		];
		expect(healthWatch([], health, now)).toEqual([
			{ condition: 'bowel', at: now.toISOString(), reason: 'No bowel movement recorded in 5 days' }
		]);
		expect(
			healthWatch(
				[],
				[...health, { at: daysAgo(1), kind: 'bowel', data: { status: 'Observed' } }],
				now
			)
		).toEqual([]);
		// Untracked people are not flagged for having no entries.
		expect(healthWatch([], [], now)).toEqual([]);
	});

	it('lists every recorded seizure', () => {
		const s = healthWatch(
			[],
			[{ at: daysAgo(2), kind: 'seizure', data: { duration: '2 min' } }],
			now
		);
		expect(s).toEqual([{ condition: 'seizure', at: daysAgo(2), reason: 'Seizure recorded' }]);
	});

	it('needs a fever plus a fast pulse, fast breathing or infection for sepsis', () => {
		const vitals = (data: Record<string, unknown>) => ({ at: daysAgo(1), kind: 'vitals', data });
		expect(healthWatch([], [vitals({ temp: 101.2 })], now)).toEqual([]);
		expect(healthWatch([], [vitals({ temp: 99, pulse: 120 })], now)).toEqual([]);
		expect(healthWatch([], [vitals({ temp: '101.2', pulse: '112' })], now)[0].reason).toBe(
			'Fever 101.2°F with pulse 112'
		);
		const notes = [{ at: daysAgo(2), text: 'Nurse thinks it may be a UTI.' }];
		expect(healthWatch(notes, [vitals({ temp: 100.6 })], now)[0].reason).toBe(
			'Fever 100.6°F with signs of infection noted'
		);
	});

	it('looks back 14 days and summarizes by condition, newest first', () => {
		const notes = [
			{ at: daysAgo(20), text: 'Choked on toast.' },
			{ at: daysAgo(3), text: 'Choked on rice.' },
			{ at: daysAgo(1), text: 'Choking on water.' }
		];
		const summary = watchSummary(healthWatch(notes, [], now));
		expect(summary).toEqual([
			{
				condition: 'aspiration',
				count: 2,
				latest: { condition: 'aspiration', at: daysAgo(1), reason: '“Choking on water.”' }
			}
		]);
	});
});
