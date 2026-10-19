// When to offer push alerts (frontend-spec-2.md §8.6): never on the first
// visit; once the person has used Guad on 3 different days, and not again
// for 30 days after "Not now".

export const PUSH_ASK_AFTER_DAYS = 3;
export const PUSH_ASK_AGAIN_DAYS = 30;
const DAY_MS = 86_400_000;

/** The days (YYYY-MM-DD) Guad was used on, with today added; only the first few are kept. */
export function recordUseDay(days: readonly string[], today: string): string[] {
	return [...new Set([...days, today])].sort().slice(0, PUSH_ASK_AFTER_DAYS);
}

export function shouldAskForPush(input: {
	days: readonly string[];
	/** When "Not now" was last chosen (ISO), if ever */
	dismissedAt: string | null;
	now: Date;
	/** Notification.permission */
	permission: string;
}): boolean {
	if (input.permission !== 'default' || input.days.length < PUSH_ASK_AFTER_DAYS) return false;
	if (!input.dismissedAt) return true;
	const at = Date.parse(input.dismissedAt);
	return !Number.isFinite(at) || input.now.getTime() - at >= PUSH_ASK_AGAIN_DAYS * DAY_MS;
}

/** What push brings each role, for the ask (no client details; these are kinds of alerts). */
export function pushAskReasons(role: string): string[] {
	return role === 'caregiver'
		? [
				'A shift coverage offer comes in',
				'Your supervisor sends back a note',
				'Medications are due soon'
			]
		: [
				'A shift goes unfilled',
				'A note is waiting for your review',
				'An incident or health reading needs attention'
			];
}
