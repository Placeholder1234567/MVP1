// Referral stage moves (research/decisions-2026-10.md §2). Stages have a
// normal forward order, but intake is not a straight line: a waitlisted
// referral is accepted when a bed opens, an accepted one goes back to the
// waitlist when the bed falls through, and a declined family can come back.
// Forward moves, skips and accepted <-> waitlist need nothing extra. Moving
// back to an earlier stage, or reopening a declined referral, needs a written
// reason, kept as a stage note. Placed is reached only through admission and
// never left.

export const REFERRAL_STAGES = [
	'inquiry',
	'touring',
	'accepted',
	'waitlist',
	'declined',
	'placed'
] as const;
export type ReferralStage = (typeof REFERRAL_STAGES)[number];

/** Position in the normal flow; accepted and waitlist are both "decided". */
const ORDER: Record<Exclude<ReferralStage, 'declined'>, number> = {
	inquiry: 1,
	touring: 2,
	accepted: 3,
	waitlist: 3,
	placed: 4
};

export type StageMove =
	{ ok: true; needsReason: boolean } | { ok: false; problem: 'admission_only' | 'placed_final' };

export function stageMove(from: ReferralStage, to: ReferralStage): StageMove {
	if (from === to) return { ok: true, needsReason: false };
	if (from === 'placed') return { ok: false, problem: 'placed_final' };
	if (to === 'placed') return { ok: false, problem: 'admission_only' };
	if (to === 'declined') return { ok: true, needsReason: false };
	if (from === 'declined') return { ok: true, needsReason: true };
	return { ok: true, needsReason: ORDER[to] < ORDER[from] };
}

/** The stages a referral at `from` may be moved to in the stage picker. */
export function nextStages(from: ReferralStage): ReferralStage[] {
	return REFERRAL_STAGES.filter((to) => stageMove(from, to).ok);
}
