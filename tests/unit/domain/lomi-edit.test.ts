import { expect, it } from 'vitest';
import {
	applyAcceptedUpdates,
	flagKey,
	groundedGoalReferences,
	openSectionFlags,
	phraseRange
} from '../../../src/lib/domain/lomi-edit';
it('requires an active goal and an exact nontrivial quote, with no generated scores', () => {
	const result = groundedGoalReferences(
		[
			{ goalId: 'active', evidence: 'brushed teeth', trials: ['Independent'] },
			{ goalId: 'other-person', evidence: 'brushed teeth' },
			{ goalId: 'active', evidence: 'brushed teeth' },
			{ goalId: 'second', evidence: 'invented evidence' },
			{ goalId: 'third', evidence: 'a' },
			null
		],
		[{ id: 'active' }, { id: 'second' }, { id: 'third' }],
		'He brushed teeth with staff support.'
	);
	expect(result).toEqual([{ goalId: 'active', evidence: 'brushed teeth' }]);
});
it('rejects malformed or missing references', () => {
	expect(groundedGoalReferences(null, [], 'Test')).toEqual([]);
	expect(groundedGoalReferences([{ goalId: 'id', evidence: 3 }], [{ id: 'id' }], 'Test')).toEqual(
		[]
	);
});
it('lists vague phrases per section until fixed or kept', () => {
	const content = { activities: 'Walked outside.', mood: 'He was fine. Then he acted out.' };
	expect(openSectionFlags(content).map((f) => [f.section, f.phrase])).toEqual([
		['mood', 'was fine'],
		['mood', 'acted out']
	]);
	expect(openSectionFlags(content)[0].tip).toBe(
		'“was fine” is too vague for the record. Describe what you saw or heard.'
	);
	const kept = new Set([flagKey('mood', 'was fine')]);
	expect(openSectionFlags(content, kept).map((f) => f.phrase)).toEqual(['acted out']);
	expect(openSectionFlags({ mood: 'He smiled at lunch.' })).toEqual([]);
});
it('finds the flagged phrase regardless of case', () => {
	expect(phraseRange('He Was Fine today.', 'was fine')).toEqual([3, 11]);
	expect(phraseRange('Calm.', 'was fine')).toBeNull();
});
it('applies only accepted updates to existing sections and keeps an undo copy', () => {
	const result = applyAcceptedUpdates({ meals: 'Ate breakfast.', mood: 'Calm.' }, [
		{ section: 'meals', text: 'Ate breakfast and lunch.' },
		{ section: 'goal_scores', text: 'Independent' },
		{ section: 'meals', text: 'Second copy ignored.' }
	]);
	expect(result.content).toEqual({ meals: 'Ate breakfast and lunch.', mood: 'Calm.' });
	expect(result.previous).toEqual({ meals: 'Ate breakfast.' });
});
