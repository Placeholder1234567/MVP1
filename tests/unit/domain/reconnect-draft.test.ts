import { expect, it } from 'vitest';
import { mergeReconnectDraft } from '../../../src/lib/domain/reconnect-draft';
it('replaces only untouched original sections, leaving unknown fields and user changes alone', () => {
	const initial = { activities: 'Walked.', mood: '', health: '' };
	const current = { ...initial, mood: 'Caregiver observation.', extra: 'Keep.' };
	expect(
		mergeReconnectDraft(
			current,
			initial,
			{ activities: 'Went for a walk.', mood: 'AI mood.', health: 'AI health.', extra: 'Drop.' },
			new Set(['health'])
		)
	).toEqual({
		content: {
			activities: 'Went for a walk.',
			mood: 'Caregiver observation.',
			health: '',
			extra: 'Keep.'
		},
		updated: ['activities']
	});
	expect(current.activities).toBe('Walked.');
});
it('preserves a field edited and then reverted, and rejects malformed or oversized output', () => {
	const initial = { activities: 'Walked.', mood: '', health: '' };
	expect(
		mergeReconnectDraft(
			initial,
			initial,
			{ activities: 'New.', mood: 'x'.repeat(6001), health: undefined } as unknown as Record<
				string,
				string
			>,
			new Set(['activities'])
		)
	).toEqual({ content: initial, updated: [] });
});
