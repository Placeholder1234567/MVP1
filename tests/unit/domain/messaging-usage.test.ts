import { expect, it } from 'vitest';
import { monthStart, smsCostEstimate } from '../../../src/lib/domain/messaging-usage';

it('starts the month on the 1st and estimates a cent per text', () => {
	expect(monthStart('2026-10-19')).toBe('2026-10-01');
	expect(smsCostEstimate(0)).toBe('$0.00');
	expect(smsCostEstimate(1234)).toBe('$12.34');
	expect(smsCostEstimate(-3)).toBe('$0.00');
});
