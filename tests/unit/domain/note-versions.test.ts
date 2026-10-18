import { describe, expect, it } from 'vitest';
import { sectionChanges, signedVersions, wordDiff } from '../../../src/lib/domain/note-versions';

const state = (status: string, activities: string, at = '2026-10-18T10:00:00Z') => ({
	at,
	by: 'Cara',
	status,
	content: { activities }
});

describe('earlier note versions (frontend-audit.md finding 14)', () => {
	it('keeps the states the author signed, numbered in order', () => {
		const versions = signedVersions([
			state('draft', 'a'),
			state('draft', 'ab'),
			state('submitted', 'ab'),
			state('returned', 'ab'),
			state('returned', 'abc'),
			state('submitted', 'abc'),
			state('approved', 'abc')
		]);
		expect(versions.map((v) => [v.number, v.content.activities])).toEqual([
			[1, 'ab'],
			[2, 'abc']
		]);
	});

	it('marks added and removed words and keeps the rest', () => {
		expect(wordDiff('Ate lunch at noon.', 'Ate a full lunch at 12:30.')).toEqual([
			{ kind: 'same', text: 'Ate ' },
			{ kind: 'added', text: 'a full ' },
			{ kind: 'same', text: 'lunch at ' },
			{ kind: 'removed', text: 'noon.' },
			{ kind: 'added', text: '12:30.' }
		]);
		expect(wordDiff('', 'New text')).toEqual([{ kind: 'added', text: 'New text' }]);
		expect(wordDiff('same', 'same')).toEqual([{ kind: 'same', text: 'same' }]);
	});

	it('lists only the sections that changed', () => {
		expect(
			sectionChanges(
				{ activities: 'Walked', meals: 'Lunch' },
				{ activities: 'Walked', mood: 'Calm' }
			).map((c) => c.section)
		).toEqual(['meals', 'mood']);
	});

	it('falls back to whole texts for very long notes', () => {
		const long = Array.from({ length: 2500 }, (_, i) => `w${i}`).join(' ');
		expect(wordDiff(long, long + ' extra').map((p) => p.kind)).toEqual(['removed', 'added']);
	});
});
