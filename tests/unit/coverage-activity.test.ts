import { expect, it } from 'vitest';
import {
	coverageLabel,
	coverageTimeline,
	recentCoverage
} from '../../src/lib/app/coverage-activity';

it('scopes the recent six requests before limiting, sorts creation rather than shift day and keeps inputs intact', () => {
	const rows = Array.from({ length: 9 }, (_, i) => ({
		id: String(i),
		home_id: 'oak',
		created_at: `2026-10-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
		day: i % 2 ? '2027-01-01' : '2025-01-01'
	}));
	const input = [
		{ id: 'foreign', home_id: 'maple', created_at: '2029-01-01T00:00:00Z', day: '' },
		...rows
	];
	const before = [...input];
	expect(recentCoverage(input, 'oak').map((r) => r.id)).toEqual(['8', '7', '6', '5', '4', '3']);
	expect(input).toEqual(before);
	expect(recentCoverage(input, '')).toEqual([]);
	expect(recentCoverage(input, 'missing')).toEqual([]);
});

it('orders equal/invalid request timestamps deterministically without hiding a recorded request', () => {
	const rows = [
		{ id: 'a', home_id: 'oak', created_at: null },
		{ id: 'b', home_id: 'oak', created_at: 'invalid' },
		{ id: 'c', home_id: 'oak', created_at: '2026-10-01T00:00:00Z' }
	];
	expect(recentCoverage(rows, 'oak').map((r) => r.id)).toEqual(['c', 'b', 'a']);
});

it('only shows a request’s matching-home steps, oldest first with stable ties', () => {
	const step = (id: string, home_id: string, coverage_request_id: string, occurred_at: string) => ({
		id,
		home_id,
		coverage_request_id,
		occurred_at
	});
	const rows = [
		step('later', 'oak', 'request', '2026-10-01T12:01:00Z'),
		step('b', 'oak', 'request', '2026-10-01T12:00:00Z'),
		step('a', 'oak', 'request', '2026-10-01T12:00:00Z'),
		step('wrong-home', 'maple', 'request', '2026-10-01T12:00:00Z'),
		step('wrong-request', 'oak', 'other', '2026-10-01T12:00:00Z')
	];
	expect(coverageTimeline(rows, 'oak', 'request').map((r) => r.id)).toEqual(['a', 'b', 'later']);
	expect(coverageTimeline(rows, '', 'request')).toEqual([]);
});

it('never turns missing/unknown coverage state into a successful assignment', () => {
	expect(coverageLabel('searching')).toBe('Finding cover');
	expect(coverageLabel('filled', 'Synthetic caregiver')).toBe('Filled by Synthetic caregiver');
	expect(coverageLabel('filled', null)).toBe('Filled');
	expect(coverageLabel('unfilled')).toBe('Needs attention');
	expect(coverageLabel(null)).toBe('Status unavailable');
	expect(coverageLabel('unknown')).toBe('Status unavailable');
});
