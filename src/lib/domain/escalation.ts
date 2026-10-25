// Escalation chains (notifications.md §8). Level 1 is the original send, made
// by notify() through the recipient's channels. Each step below is a later
// level, fired only if nobody has acknowledged the event yet. Delays are
// minutes after the original send.
//
// Not here, by design:
//   coverage_offer    the Schedule Service's reminder and timeout jobs own it
//   med_due_reminder  the med-reminder sweep sends med_overdue itself, once the
//                     dose is 30 minutes late with no MAR record (med-reminders.ts)

export interface EscalationStep {
	afterMinutes: number;
	/** 'same': the original recipients who haven't acknowledged; 'admins': the agency's admins */
	to: 'same' | 'admins';
	channel: 'push' | 'sms';
}

export const MAX_ESCALATION_STEPS = 3;

export const ESCALATION_CHAINS: Record<string, EscalationStep[]> = {
	incident_high_severity: [
		{ afterMinutes: 15, to: 'same', channel: 'sms' },
		{ afterMinutes: 30, to: 'admins', channel: 'sms' }
	],
	med_refusal: [
		{ afterMinutes: 60, to: 'same', channel: 'sms' },
		{ afterMinutes: 120, to: 'admins', channel: 'sms' }
	],
	health_alert: [
		{ afterMinutes: 60, to: 'same', channel: 'sms' },
		{ afterMinutes: 120, to: 'admins', channel: 'sms' }
	],
	coverage_unfilled: [{ afterMinutes: 30, to: 'admins', channel: 'sms' }],
	med_possible_double_dose: [{ afterMinutes: 15, to: 'admins', channel: 'sms' }],
	med_given_after_stop: [{ afterMinutes: 15, to: 'admins', channel: 'sms' }],
	note_submitted: [{ afterMinutes: 24 * 60, to: 'same', channel: 'push' }],
	note_sent_back: [
		{ afterMinutes: 8 * 60, to: 'same', channel: 'push' },
		{ afterMinutes: 24 * 60, to: 'same', channel: 'push' }
	],
	// "Repeat daily, stop after 3 days."
	incident_review_needed: [
		{ afterMinutes: 24 * 60, to: 'same', channel: 'sms' },
		{ afterMinutes: 48 * 60, to: 'same', channel: 'sms' }
	]
};

export function escalationStep(type: string, step: number): EscalationStep | undefined {
	return step >= 1 && step <= MAX_ESCALATION_STEPS
		? ESCALATION_CHAINS[type]?.[step - 1]
		: undefined;
}

/** Seconds from now until `step` fires, given the previous step fired now (step 1: from the send). */
export function secondsUntilStep(type: string, step: number): number | undefined {
	const next = escalationStep(type, step);
	if (!next) return undefined;
	const previous = step > 1 ? escalationStep(type, step - 1)!.afterMinutes : 0;
	return (next.afterMinutes - previous) * 60;
}

/**
 * Task name for one level of one event's escalation, so it is queued once
 * however many recipients the event had, and can be cancelled.
 */
export function escalationTaskName(event: string, step: number): string {
	return `escalation-${event}-${step}`.replace(/[^A-Za-z0-9_-]/g, '-');
}
