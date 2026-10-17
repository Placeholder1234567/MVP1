import { expect, it } from 'vitest';
import { GoalChanges, NewGoal, NewGoalTemplate } from '../../../src/lib/server/services/goal';
const id = '11111111-1111-4111-8111-111111111111';
it('bounds goal fields and rejects privileged or identity changes', () => {
	const base = { clientId: id, area: 'Choice', text: 'A synthetic goal' };
	for (const input of [
		{ ...base, area: ' ' },
		{ ...base, text: 'x'.repeat(2001) },
		{ ...base, steps: Array(31).fill('Step') },
		{ ...base, steps: [' '] },
		{ ...base, startedAt: 'not-a-date' },
		{ ...base, stoppedAt: new Date() },
		{ ...base, homeId: id }
	])
		expect(NewGoal.safeParse(input).success).toBe(false);
	expect(GoalChanges.safeParse({ id }).success).toBe(false);
	expect(GoalChanges.safeParse({ id, clientId: id }).success).toBe(false);
	expect(GoalChanges.parse({ id, steps: [], frequency: '' })).toMatchObject({
		steps: [],
		frequency: ''
	});
	expect(
		NewGoalTemplate.safeParse({ area: 'Choice', text: 'Goal', is_default: true }).success
	).toBe(false);
});
