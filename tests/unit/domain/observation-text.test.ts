import { expect, it } from 'vitest';
import { appendObservations } from '../../../src/lib/domain/observation-text';

it('appends a complete transcript exactly at the field boundary', () => {
	const transcript = 'No pain at 14:35; drank 250 mL.';
	const current = 'x'.repeat(8000 - transcript.length - 1);
	expect(appendObservations(current, transcript, 8000)).toBe(current + ' ' + transcript);
});
it('refuses an over-budget transcript without cutting its final negation or number', () => {
	const transcript = 'Staff did not give a second dose at 14:35.';
	expect(appendObservations('x'.repeat(7990), transcript, 8000)).toBeNull();
	expect(appendObservations('x'.repeat(1990), transcript, 2000)).toBeNull();
});
it('keeps punctuation and non-ASCII observations intact', () => {
	expect(appendObservations('', 'Renée said “no”; 250 mL.', 2000)).toBe('Renée said “no”; 250 mL.');
});
