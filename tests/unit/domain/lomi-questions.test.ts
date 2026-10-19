import { describe, expect, it } from 'vitest';
import { lomiQuestions } from '../../../src/lib/domain/lomi-questions';

const shift = (over: Partial<Record<string, string>> = {}) => ({
	activities: 'Walked to the park and helped make lunch.',
	meals: 'Ate all of breakfast and lunch.',
	mood: 'Cheerful.',
	health: 'No concerns.',
	...over
});

describe('lomiQuestions', () => {
	it('asks nothing when every section is filled', () => {
		expect(lomiQuestions(shift(), 'Marcus')).toEqual([]);
	});
	it('asks specific questions for empty and thin sections, in order', () => {
		expect(lomiQuestions(shift({ mood: '', meals: ' ', activities: 'TV' }), 'Marcus')).toEqual([
			{ section: 'activities', text: 'Can you tell me more about what Marcus did today?' },
			{ section: 'meals', text: 'Did Marcus eat their meals?' },
			{ section: 'mood', text: "What was Marcus's mood today?" }
		]);
	});
	it('asks at most three, and the next appears once one is skipped or answered', () => {
		const empty = shift({ activities: '', meals: '', mood: '', health: '' });
		expect(lomiQuestions(empty, 'Marcus').map((q) => q.section)).toEqual([
			'activities',
			'meals',
			'mood'
		]);
		expect(lomiQuestions(empty, 'Marcus', new Set(['meals'])).map((q) => q.section)).toEqual([
			'activities',
			'mood',
			'health'
		]);
	});
	it('covers behavior notes and only the sections the draft has', () => {
		const behavior = {
			before: '',
			behavior: 'Threw a cup.',
			response: '',
			outcome: 'Calmed down.'
		};
		expect(lomiQuestions(behavior, 'Rosa')).toEqual([
			{ section: 'before', text: 'What happened right before?' },
			{ section: 'response', text: 'How did staff respond?' }
		]);
	});
});
