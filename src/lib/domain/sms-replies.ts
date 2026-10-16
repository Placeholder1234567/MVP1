// Two-way SMS (notifications.md §6 "Incoming Replies", "Opt-Out"): how a text
// from a staff member is read, and the 4-digit code that ties a reply to one
// coverage offer when the person has several.

export type SmsReply =
	| { kind: 'answer'; reply: 'accepted' | 'declined'; code?: string }
	| { kind: 'stop' }
	| { kind: 'start' }
	| { kind: 'unknown' };

const YES = new Set(['YES', 'Y', 'SURE', 'OK', 'YEP']);
const NO = new Set(['NO', 'N', 'NOPE', 'CANT', "CAN'T"]);
// Carrier opt-out keywords. AWS adds the number to its opt-out list; we stop
// choosing SMS for the person too.
const STOP = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT']);
const START = new Set(['START', 'UNSTOP']);

export function parseSmsReply(body: string): SmsReply {
	const words = body
		.trim()
		.toUpperCase()
		.replace(/[’‘]/g, "'")
		.split(/[\s,.!]+/)
		.filter(Boolean);
	const [first, ...rest] = words;
	if (!first) return { kind: 'unknown' };
	if (STOP.has(first)) return { kind: 'stop' };
	if (START.has(first)) return { kind: 'start' };
	const reply = YES.has(first) ? 'accepted' : NO.has(first) ? 'declined' : null;
	if (!reply) return { kind: 'unknown' };
	const code = rest.find((w) => /^\d{4}$/.test(w));
	if (rest.some((w) => w !== code)) return { kind: 'unknown' };
	return code ? { kind: 'answer', reply, code } : { kind: 'answer', reply };
}

/**
 * The offer's 4-digit code (1000-9999), derived from the coverage request ID
 * (FNV-1a), so it needs no column and is the same in the SMS and on reply.
 * Codes can collide; a reply whose code matches several open offers is
 * treated as ambiguous.
 */
export function offerCode(requestId: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < requestId.length; i++) {
		h ^= requestId.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return String(1000 + (h % 9000));
}

/** Fixed reply texts (PHI-free, under 160 characters). */
export const SMS_REPLY_TEXT = {
	unknown: "Guad: Sorry, we didn't understand. Reply YES to accept or NO to decline.",
	noOffers: 'Guad: You have no open shift offers right now.',
	ambiguous: (n: number) =>
		`Guad: You have ${n} open offers. Reply YES or NO with the code from the offer you mean.`,
	noSuchCode: 'Guad: No open offer matches that code. Check the code and try again.',
	filled: 'Guad: This shift has already been filled. Thank you!',
	closed: 'Guad: This offer is closed. Open the app or contact your supervisor.',
	accepted: 'Guad: Thanks! The shift is yours. Details are in the app.',
	declined: "Guad: Thanks, we've noted you can't cover this shift.",
	started: 'Guad: Text messages are back on. Reply STOP to opt out.'
} as const;
