import { describe, expect, it } from 'vitest';
import { nextStages, stageMove } from '../../../src/lib/domain/referral-stage';

describe('referral stage moves', () => {
	it('allows forward moves and skips without a reason', () => {
		expect(stageMove('inquiry', 'touring')).toEqual({ ok: true, needsReason: false });
		expect(stageMove('inquiry', 'accepted')).toEqual({ ok: true, needsReason: false });
		expect(stageMove('touring', 'waitlist')).toEqual({ ok: true, needsReason: false });
	});
	it('treats accepted and waitlist as the same step', () => {
		expect(stageMove('accepted', 'waitlist')).toEqual({ ok: true, needsReason: false });
		expect(stageMove('waitlist', 'accepted')).toEqual({ ok: true, needsReason: false });
	});
	it('needs a reason to move back or to reopen a declined referral', () => {
		expect(stageMove('accepted', 'touring')).toEqual({ ok: true, needsReason: true });
		expect(stageMove('waitlist', 'inquiry')).toEqual({ ok: true, needsReason: true });
		expect(stageMove('declined', 'inquiry')).toEqual({ ok: true, needsReason: true });
		expect(stageMove('declined', 'accepted')).toEqual({ ok: true, needsReason: true });
	});
	it('can decline from any open stage', () => {
		for (const from of ['inquiry', 'touring', 'accepted', 'waitlist'] as const)
			expect(stageMove(from, 'declined')).toEqual({ ok: true, needsReason: false });
	});
	it('places only through admission and never leaves placed', () => {
		expect(stageMove('accepted', 'placed')).toEqual({ ok: false, problem: 'admission_only' });
		expect(stageMove('placed', 'inquiry')).toEqual({ ok: false, problem: 'placed_final' });
		expect(nextStages('accepted')).not.toContain('placed');
		expect(nextStages('placed')).toEqual(['placed']);
	});
});
