// Incoming text messages (notifications.md §6 "Incoming Replies", "Opt-Out"),
// delivered by the sms-inbound SNS webhook after its signature is verified.
//
//   YES/NO [code]  answers a coverage offer, through respondCoverage() run as
//                  the sender, so it gets the same rules as accepting in the app
//   STOP / START   turns SMS off / back on in the sender's preferences
//
// Replies are fixed PHI-free texts (domain/sms-replies.ts). Logs carry the
// inbound message ID and outcome only, never the number or the text.
import { offerCode, parseSmsReply, SMS_REPLY_TEXT, type SmsReply } from '../../../domain/index.ts';
import { withService, withUser } from '../../db';
import { ServiceError } from '../../errors';
import { providers } from '../../messaging/index.ts';
import { getCurrentUser, type CurrentUser } from '../auth/index.ts';
import { setSmsOptOut } from '../notification/index.ts';
import { coverageOffers, coverageStatus, respondCoverage } from '../schedule/index.ts';
import { activeProfilesByPhone, claimInbound, releaseInbound } from './sms.queries';

export interface InboundSms {
	originationNumber?: string;
	messageBody?: string;
	inboundMessageId?: string;
}

export type InboundOutcome =
	| 'ignored'
	| 'duplicate'
	| 'opted_out'
	| 'opted_in'
	| 'accepted'
	| 'declined'
	| 'filled'
	| 'closed'
	| 'no_offers'
	| 'ambiguous'
	| 'no_such_code'
	| 'unknown';

const REQUEST_INFO = { user_agent: 'sms-inbound' };

export async function handleInboundSms(event: InboundSms): Promise<InboundOutcome> {
	const phone = event.originationNumber;
	if (!phone || typeof event.messageBody !== 'string') return 'ignored';
	const staff = await withService((tx) => activeProfilesByPhone(tx, phone));
	// Unknown numbers get no answer, so the number can't be probed.
	if (!staff.length) return 'ignored';

	// SNS delivers at least once: a re-delivered text must not answer twice.
	const messageId = event.inboundMessageId;
	if (messageId && !(await withService((tx) => claimInbound(tx, staff[0].agencyId, messageId))))
		return 'duplicate';
	try {
		return await respond(event.messageBody, phone, staff, messageId);
	} catch (e) {
		if (messageId) await withService((tx) => releaseInbound(tx, messageId));
		throw e;
	}
}

async function respond(
	body: string,
	phone: string,
	staff: Awaited<ReturnType<typeof activeProfilesByPhone>>,
	messageId: string | undefined
): Promise<InboundOutcome> {
	const parsed = parseSmsReply(body);
	const replyId = `sms-reply-${messageId ?? Date.now()}`;
	const reply = (body: string) =>
		providers().sms(phone, { notificationId: replyId, title: 'Guad', body, link: '/' });

	if (parsed.kind === 'stop' || parsed.kind === 'start') {
		const optedOut = parsed.kind === 'stop';
		for (const p of staff) {
			await withService((tx) => setSmsOptOut(tx, p.agencyId, p, optedOut));
		}
		// AWS answers STOP itself; after START, say texts are back on.
		if (!optedOut) await reply(SMS_REPLY_TEXT.started);
		return optedOut ? 'opted_out' : 'opted_in';
	}
	if (parsed.kind === 'unknown') {
		await reply(SMS_REPLY_TEXT.unknown);
		return 'unknown';
	}
	const outcome = await answerOffer(staff, parsed);
	await reply(TEXT[outcome.outcome](outcome.count));
	return outcome.outcome;
}

type Answer = Extract<SmsReply, { kind: 'answer' }>;
type AnswerOutcome = Exclude<
	InboundOutcome,
	'ignored' | 'duplicate' | 'opted_out' | 'opted_in' | 'unknown'
>;

const TEXT: Record<AnswerOutcome, (n: number) => string> = {
	accepted: () => SMS_REPLY_TEXT.accepted,
	declined: () => SMS_REPLY_TEXT.declined,
	filled: () => SMS_REPLY_TEXT.filled,
	closed: () => SMS_REPLY_TEXT.closed,
	no_offers: () => SMS_REPLY_TEXT.noOffers,
	ambiguous: (n) => SMS_REPLY_TEXT.ambiguous(n),
	no_such_code: () => SMS_REPLY_TEXT.noSuchCode
};

async function answerOffer(
	staff: { authUid: string }[],
	answer: Answer
): Promise<{ outcome: AnswerOutcome; count: number }> {
	// Open offers for every profile with this number (normally one).
	const offers: { user: CurrentUser; id: string }[] = [];
	for (const p of staff) {
		const user = await getCurrentUser(p.authUid);
		if (!user || !user.features.includes('coverage')) continue;
		const open = await withUser(user.claims, REQUEST_INFO, (tx) => coverageOffers(tx, user));
		offers.push(...open.map((o) => ({ user, id: o.id })));
	}
	if (!offers.length) return { outcome: 'no_offers', count: 0 };
	const matches = answer.code ? offers.filter((o) => offerCode(o.id) === answer.code) : offers;
	if (!matches.length) return { outcome: 'no_such_code', count: 0 };
	if (matches.length > 1) return { outcome: 'ambiguous', count: matches.length };

	const [{ user, id }] = matches;
	try {
		await withUser(user.claims, REQUEST_INFO, (tx) => respondCoverage(tx, user, id, answer.reply));
		return { outcome: answer.reply, count: 1 };
	} catch (e) {
		if (!(e instanceof ServiceError)) throw e;
		// Someone else accepted first, or eligibility changed since the offer.
		const status = await withUser(user.claims, REQUEST_INFO, (tx) =>
			coverageStatus(tx, user.agencyId, id)
		);
		return { outcome: status === 'filled' ? 'filled' : 'closed', count: 1 };
	}
}
