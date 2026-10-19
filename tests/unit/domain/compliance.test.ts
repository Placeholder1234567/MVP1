import { describe, expect, it } from 'vitest';
import {
	complianceScore,
	incidentReviewPart,
	overviewAttention,
	scoreChange,
	shiftNotesPart
} from '../../../src/lib/domain/compliance';

describe('complianceScore', () => {
	it('averages the parts that have something to measure', () => {
		expect(complianceScore({ done: 9, of: 10 }, { done: 1, of: 1 }, { done: 0, of: 0 }).score).toBe(
			95
		);
		expect(complianceScore({ done: 1, of: 2 }, { done: 3, of: 4 }, { done: 0, of: 1 }).score).toBe(
			42
		);
		expect(complianceScore({ done: 0, of: 0 }, { done: 0, of: 0 }, { done: 0, of: 0 }).score).toBe(
			null
		);
	});
});

describe('shiftNotesPart', () => {
	it('counts worked shifts with a signed note from the person on shift', () => {
		const slot = (day: string, shift: string, who: string | null) => ({
			home_id: 'h1',
			day,
			shift,
			assigned_to: who
		});
		const note = (day: string, shift: string, who: string, status = 'submitted') => ({
			home_id: 'h1',
			day,
			shift,
			author_id: who,
			status
		});
		const part = shiftNotesPart(
			[
				slot('2026-10-17', 'am', 'cara'),
				slot('2026-10-17', 'pm', 'dev'),
				slot('2026-10-17', 'on', null), // nobody worked it
				slot('2026-10-18', 'pm', 'cara'), // still running
				slot('2026-10-01', 'am', 'cara') // outside the window
			],
			[note('2026-10-17', 'am', 'cara'), note('2026-10-17', 'pm', 'dev', 'draft')],
			'h1',
			['2026-10-17', '2026-10-18'],
			new Date('2026-10-18T16:00:00Z'),
			'UTC'
		);
		expect(part).toEqual({ done: 1, of: 2 });
	});
});

describe('incidentReviewPart', () => {
	const at = new Date('2026-10-18T12:00:00Z');
	const since = new Date('2026-10-11T00:00:00Z');
	it('counts reviews within 24 hours and overdue open incidents', () => {
		expect(
			incidentReviewPart(
				[
					// reviewed after 2 hours
					{
						created_at: '2026-10-15T08:00:00Z',
						updated_at: '2026-10-15T10:00:00Z',
						status: 'reviewed'
					},
					// reviewed after 30 hours
					{
						created_at: '2026-10-14T08:00:00Z',
						updated_at: '2026-10-15T14:00:00Z',
						status: 'reviewed'
					},
					// open and overdue
					{ created_at: '2026-10-16T08:00:00Z', updated_at: null, status: 'open' },
					// open, still within the day
					{ created_at: '2026-10-18T08:00:00Z', updated_at: null, status: 'open' },
					// before the window
					{
						created_at: '2026-10-01T08:00:00Z',
						updated_at: '2026-10-01T09:00:00Z',
						status: 'reviewed'
					}
				],
				since,
				at
			)
		).toEqual({ done: 1, of: 3 });
	});
});

describe('incidentReviewPart with reviewed_at', () => {
	it('measures the first review, not later edits', () => {
		expect(
			incidentReviewPart(
				[
					{
						created_at: '2026-10-15T08:00:00Z',
						reviewed_at: '2026-10-15T10:00:00Z',
						updated_at: '2026-10-17T09:00:00Z', // follow-up notes edited later
						status: 'reviewed'
					}
				],
				new Date('2026-10-11T00:00:00Z'),
				new Date('2026-10-18T12:00:00Z')
			)
		).toEqual({ done: 1, of: 1 });
	});
});

describe('scoreChange', () => {
	it('is in points, steady within 2', () => {
		expect(scoreChange(80, 88)).toEqual({ points: 8, direction: 'up' });
		expect(scoreChange(90, 81)).toEqual({ points: -9, direction: 'down' });
		expect(scoreChange(90, 92)).toEqual({ points: 2, direction: 'steady' });
		expect(scoreChange(null, 90)).toBeNull();
	});
});

describe('incidentReviewPart window', () => {
	it('counts only incidents reported inside [since, until)', () => {
		const at = new Date('2026-10-19T12:00:00Z');
		const incidents = [
			{
				created_at: '2026-10-08T10:00:00Z',
				updated_at: null,
				reviewed_at: '2026-10-08T12:00:00Z',
				status: 'reviewed'
			},
			{
				created_at: '2026-10-15T10:00:00Z',
				updated_at: null,
				reviewed_at: '2026-10-15T11:00:00Z',
				status: 'reviewed'
			}
		];
		expect(
			incidentReviewPart(
				incidents,
				new Date('2026-10-06T00:00:00Z'),
				at,
				new Date('2026-10-13T00:00:00Z')
			)
		).toEqual({ done: 1, of: 1 });
	});
});

describe('overviewAttention', () => {
	it('counts open incidents and unacknowledged flagged readings at the home', () => {
		expect(
			overviewAttention(
				[
					{ home_id: 'h', status: 'open' },
					{ home_id: 'h', status: 'reviewed' },
					{ home_id: 'x', status: 'open' }
				],
				[
					{ home_id: 'h', flags: '["temperature"]', acknowledged: 0 },
					{ home_id: 'h', flags: '["pulse"]', acknowledged: 1 },
					{ home_id: 'h', flags: '[]', acknowledged: 0 },
					{ home_id: 'h', flags: 'not json', acknowledged: 0 }
				],
				'h'
			)
		).toBe(2);
	});
});
