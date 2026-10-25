import { describe, expect, it } from 'vitest';
import {
	fallbackSummary,
	nextSteps,
	isClinicalAdvice,
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

describe('nextSteps', () => {
	const busy: DaySnapshot = {
		...empty,
		openShifts: ['pm'],
		coverage: [{ shift: 'pm', status: 'searching' }],
		missingNotes: ['Ana', 'Ben', 'Cy', 'Dee'],
		notesToReview: 2,
		incidents: [{ person: 'Ben', type: 'Fall', severity: 'Low' }],
		meds: [
			{ person: 'Ben', status: 'refused' },
			{ person: 'Ana', status: 'held' }
		],
		dosesNotRecorded: 1,
		healthAlerts: [{ person: 'Ana', alert: 'Temperature above 100.4' }],
		clockExceptions: 1
	};

	it('is empty when nothing needs doing', () => {
		expect(nextSteps(empty)).toEqual([]);
	});

	it('lists operational steps in priority order, each with where to do it', () => {
		expect(nextSteps(busy, 10)).toEqual([
			{ text: 'Review 1 open incident', place: 'incidents' },
			{ text: 'Look at 1 health reading flagged outside the agency’s range', place: 'health' },
			{ text: 'Check 1 scheduled dose with no record yet', place: 'medications' },
			{
				text: 'Confirm 2 refused or held doses were reported as your procedure requires',
				place: 'medications'
			},
			{ text: 'Fill 1 open shift (1 looking for cover)', place: 'schedule' },
			{ text: 'Remind staff: no note yet for Ana, Ben, Cy and 1 more', place: 'notes' },
			{ text: 'Review 2 submitted notes', place: 'review' },
			{ text: 'Check 1 clock record needing review', place: 'timesheets' }
		]);
		expect(nextSteps(busy)).toHaveLength(3);
	});

	it('never gives clinical advice', () => {
		const text = nextSteps(busy, 10)
			.map((s) => s.text)
			.join(' ');
		expect(text).not.toMatch(/diagnos|dosage|increase|decrease|prescri|treat|administer|mg\b/i);
		// No names of health readings or medications either, only counts.
		expect(text).not.toMatch(/Temperature/);
	});
});

describe('isClinicalAdvice', () => {
	it('catches advice and diagnoses the briefing must never give', () => {
		for (const text of [
			'You should give her an extra dose of Tylenol tonight.',
			'Consider increasing his insulin before dinner.',
			'I recommend starting antibiotics.',
			'Staff should withhold the 8 pm medication.',
			'Try pushing fluids for the rest of the day.',
			'She may have a UTI given the fever.',
			'He is probably having a stroke.',
			'Based on the readings, a diagnosis of pneumonia is likely.'
		])
			expect(isClinicalAdvice(text), text).toBe(true);
	});
	it('lets plain facts through', () => {
		for (const text of [
			'2 doses were refused at Oak House this morning.',
			'One out-of-range vital (temperature) has not been acknowledged.',
			'The PM shift is still open and 3 notes are waiting for review.',
			'An incident was reported at 9:40 and is still open.',
			'Medication was held for one person; follow your protocol.'
		])
			expect(isClinicalAdvice(text), text).toBe(false);
	});
});
