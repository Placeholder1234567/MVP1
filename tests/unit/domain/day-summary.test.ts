import { describe, expect, it } from 'vitest';
import {
	fallbackSummary,
	plainBriefing,
	type DaySnapshot
} from '../../../src/lib/domain/day-summary';

const empty: DaySnapshot = {
	day: '2026-10-16',
	home: 'Oak House',
	openShifts: [],
	coverage: [],
	notes: [],
	missingNotes: [],
	notesToReview: 0,
	incidents: [],
	meds: [],
	dosesNotRecorded: 0,
	healthAlerts: [],
	clockExceptions: 0
};

describe('fallbackSummary', () => {
	it('says when nothing needs follow-up', () => {
		expect(fallbackSummary(empty)).toBe('Nothing needs follow-up right now.');
	});

	it('briefs in priority order', () => {
		expect(
			fallbackSummary({
				...empty,
				notesToReview: 2,
				missingNotes: ['Ana', 'Ben'],
				openShifts: ['pm'],
				meds: [{ person: 'Ben', status: 'refused' }],
				healthAlerts: [{ person: 'Ana', alert: 'Temperature high' }],
				incidents: [{ person: 'Ben', type: 'Fall', severity: 'Low' }],
				dosesNotRecorded: 3,
				clockExceptions: 1
			})
		).toBe(
			'1 incident open. 1 health alert to follow up. 1 dose refused or held. 3 scheduled doses not recorded yet. 1 shift still open. Notes still missing for Ana, Ben. 2 notes waiting for review. 1 clock exception to check.'
		);
	});
});

describe('plainBriefing', () => {
	it('removes headings, bullets and emphasis', () => {
		expect(plainBriefing('## Today\n- **One** fall at Oak.\n2. Notes are due.')).toBe(
			'Today One fall at Oak. Notes are due.'
		);
	});
});
