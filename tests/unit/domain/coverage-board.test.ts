import { describe, expect, it } from 'vitest';
import { coverageBoardText } from '../../../src/lib/domain/coverage-board';

describe('coverageBoardText', () => {
	it('announces a callout and how many were offered', () => {
		expect(
			coverageBoardText('2026-10-23', 'pm', {
				kind: 'offered',
				calledOutName: 'Cara Giver',
				eligible: 3
			})
		).toBe(
			'Cara can’t make the evening shift on Oct 23. I’ve offered it to 3 eligible staff members.'
		);
		expect(coverageBoardText('2026-10-23', 'am', { kind: 'offered', eligible: 1 })).toBe(
			'The morning shift on Oct 23 is open. I’ve offered it to 1 eligible staff member.'
		);
		expect(coverageBoardText('2026-10-23', 'on', { kind: 'offered', eligible: 0 })).toBe(
			'The overnight shift on Oct 23 is open. No one is eligible, so a supervisor will fill it.'
		);
	});
	it('announces who covered it, or that a supervisor will', () => {
		expect(coverageBoardText('2026-10-23', 'pm', { kind: 'covered', filledName: 'Eli Test' })).toBe(
			'The evening shift on Oct 23 is covered by Eli.'
		);
		expect(coverageBoardText('2026-10-23', 'pm', { kind: 'unfilled' })).toBe(
			'No one has taken the evening shift on Oct 23 yet, so a supervisor will fill it.'
		);
	});
});
