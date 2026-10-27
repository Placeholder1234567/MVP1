import { expect, it } from 'vitest';
import { draftLocally } from '../../../src/lib/domain/lomi';
import { LOMI_OBSERVATIONS } from '../../fixtures/lomi-observations';

for (const sample of LOMI_OBSERVATIONS) {
	it(`local draft preserves clinical qualifiers: ${sample.id}`, () => {
		const result = draftLocally(sample.observations, sample.kind);
		const text = Object.values(result.content).join(' ');
		for (const fact of sample.retain) expect(text).toContain(fact);
		// Local mode may move sentences, but must neither add clinical claims nor
		// drop characters (including negation, numbers, attribution and punctuation).
		const characters = (value: string) => [...value.replace(/\s/g, '')].sort().join('');
		expect(characters(text)).toBe(characters(sample.observations));
		expect(result.fallback).toBe(true);
		expect(result.goalReferences).toBeUndefined();
		if (sample.kind === 'behavior') {
			expect(result.content.before).toBe('');
			expect(result.content.response).toBe('');
			expect(result.content.outcome).toBe('');
		}
	});
}
