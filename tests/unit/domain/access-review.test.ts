import { describe, expect, it } from 'vitest';
import {
	accessReview,
	accessReviewTitle,
	isDormant,
	type ReviewProfile
} from '../../../src/lib/domain/access-review';

const now = new Date('2026-10-19T12:00:00Z');
const days = (n: number) => new Date(now.getTime() - n * 86_400_000);
const profile = (over: Partial<ReviewProfile> & { id: string }): ReviewProfile => ({
	role: 'caregiver',
	active: true,
	homeIds: [],
	createdAt: days(200),
	lastSignInAt: days(1),
	...over
});

describe('isDormant', () => {
	it('flags active accounts unused for 90+ days, or never used 90 days after creation', () => {
		expect(isDormant(profile({ id: 'a', lastSignInAt: days(90) }), now)).toBe(true);
		expect(isDormant(profile({ id: 'b', lastSignInAt: days(89) }), now)).toBe(false);
		// Never signed in since sign-ins were first recorded (2026-10-19): counts
		// from then, so older accounts aren't all flagged the day this ships.
		expect(isDormant(profile({ id: 'c', lastSignInAt: null, createdAt: days(120) }), now)).toBe(
			false
		);
		const later = new Date('2027-01-18T00:00:00Z');
		expect(isDormant(profile({ id: 'c', lastSignInAt: null, createdAt: days(120) }), later)).toBe(
			true
		);
		expect(isDormant(profile({ id: 'd', lastSignInAt: null, createdAt: days(10) }), now)).toBe(
			false
		);
		expect(isDormant(profile({ id: 'e', lastSignInAt: days(300), active: false }), now)).toBe(
			false
		);
	});
});

describe('accessReview', () => {
	it('finds caregivers with homes they had no shift at in 30 days', () => {
		const review = accessReview(
			[
				profile({ id: 'cara', homeIds: ['oak', 'elm'] }),
				profile({ id: 'dev', homeIds: ['oak'] }),
				profile({ id: 'new', homeIds: ['elm'], createdAt: days(5) }),
				profile({ id: 'sam', role: 'supervisor', homeIds: ['oak', 'elm'] }),
				profile({ id: 'old', homeIds: ['oak'], lastSignInAt: days(120) })
			],
			[
				{ homeId: 'oak', assignedTo: 'cara', day: '2026-10-10' },
				{ homeId: 'elm', assignedTo: 'cara', day: '2026-08-01' },
				{ homeId: 'oak', assignedTo: 'dev', day: '2026-09-25' },
				{ homeId: 'oak', assignedTo: 'old', day: '2026-10-01' }
			],
			now,
			'2026-10-19'
		);
		expect(review.unusedHomes).toEqual([{ profileId: 'cara', homeIds: ['elm'] }]);
		expect(review.dormant).toEqual(['old']);
		expect(accessReviewTitle(review)).toBe(
			'Access review: 1 active account unused for 90+ days; 1 caregiver has home access with no shift there in 30 days'
		);
		expect(accessReviewTitle({ dormant: [], unusedHomes: [] })).toBeNull();
	});
});
