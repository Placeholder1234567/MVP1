import { expect, it } from 'vitest';
import { draftLocally } from '../../../src/lib/domain/lomi';

it('preserves source facts and leaves unstated sections empty', () => {
	const result = draftLocally('Ate lunch. Completed a puzzle.', 'shift');
	expect(result.content).toEqual({
		activities: 'Completed a puzzle.',
		meals: 'Ate lunch.',
		mood: '',
		health: ''
	});
	expect(result.fallback).toBe(true);
});
it('does not hide an incident inside a meal sentence and flags vague wording', () => {
	const result = draftLocally('Fell after lunch. Was fine.', 'shift');
	expect(result.content.health).toBe('Fell after lunch.');
	expect(result.incident.detected).toBe(true);
	expect(result.flags.map((f) => f.phrase)).toContain('was fine');
	expect(result.content.mood).toBe('Was fine.');
});
it('never invents a behavior antecedent or outcome', () => {
	const result = draftLocally('Yelled for one minute.', 'behavior');
	expect(result.content).toEqual({
		before: '',
		behavior: 'Yelled for one minute.',
		response: '',
		outcome: '',
		duration: ''
	});
});
