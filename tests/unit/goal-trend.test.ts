import { expect, it } from 'vitest';
import { savedGoalTrend } from '../../src/lib/app/goal-trend';

const note = {
	id: 'note',
	agency_id: 'agency',
	home_id: 'home',
	client_id: 'person',
	day: '2026-10-17',
	status: 'submitted'
};
const trial = {
	id: 'trial',
	agency_id: 'agency',
	home_id: 'home',
	note_id: 'note',
	goal_id: 'goal',
	trials: '["Independent","Refused","Verbal prompt"]',
	not_attempted: 0
};
const input = {
	agencyId: 'agency',
	homeId: 'home',
	clientId: 'person',
	goalId: 'goal',
	through: '2026-10-17',
	notes: [note],
	trials: [trial]
};
it('uses the same weighted denominator as exports and leaves missing days without a zero score', () => {
	const trend = savedGoalTrend(input);
	expect(trend.from).toBe('2026-10-04');
	expect(trend.summary).toMatchObject({
		recordedTrials: 3,
		independentTrials: 1,
		refusedTrials: 1,
		independentPercent: 33
	});
	expect(trend.days).toHaveLength(14);
	expect(trend.days[0].summary).toBeNull();
	expect(trend.days.at(-1)?.summary?.independentPercent).toBe(33);
});
it('requires matching agency, person, home, goal, signed state and date window', () => {
	for (const override of [
		{ agency_id: 'foreign' },
		{ client_id: 'other' },
		{ home_id: 'other' },
		{ status: 'draft' },
		{ status: 'returned' },
		{ day: '2026-10-03' },
		{ day: '2026-10-18' }
	]) {
		expect(savedGoalTrend({ ...input, notes: [{ ...note, ...override }] }).summary).toBeNull();
	}
	for (const override of [
		{ agency_id: 'foreign' },
		{ home_id: 'other' },
		{ goal_id: 'other' },
		{ note_id: 'missing' }
	]) {
		expect(savedGoalTrend({ ...input, trials: [{ ...trial, ...override }] }).summary).toBeNull();
	}
});
it('separates skipped, empty, unknown and malformed source records without inferring achievement', () => {
	const result = savedGoalTrend({
		...input,
		trials: [
			{ ...trial, id: 'skip', not_attempted: 1 },
			{ ...trial, id: 'empty', trials: '[]' },
			{ ...trial, id: 'unknown', trials: '["Unknown","Independent"]' },
			{ ...trial, id: 'broken', trials: 'not-json' }
		]
	});
	expect(result.unreadableRecords).toBe(1);
	expect(result.summary).toMatchObject({
		records: 3,
		notAttemptedRecords: 1,
		emptyAttemptRecords: 1,
		ignoredTrialsOnNotAttempted: 3,
		recordedTrials: 2,
		unknownTrials: 1,
		independentPercent: 50
	});
});
