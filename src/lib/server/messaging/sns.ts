// Amazon SNS message verification (notifications.md §6, "Security"). SES
// bounces and SMS delivery events reach the worker as SNS HTTPS messages.
// Each one is checked before it's trusted:
//   1. the signing certificate URL is an HTTPS sns.<region>.amazonaws.com .pem,
//   2. the RSA signature over the canonical string verifies with that certificate,
//   3. the TopicArn is the topic configured for this endpoint.
// Anything else is rejected, so forged requests can't suppress addresses or
// change delivery status.
import { createVerify } from 'node:crypto';

export interface SnsMessage {
	Type: 'Notification' | 'SubscriptionConfirmation' | 'UnsubscribeConfirmation';
	MessageId: string;
	TopicArn: string;
	Message: string;
	Timestamp: string;
	SignatureVersion: '1' | '2';
	Signature: string;
	SigningCertURL: string;
	Subject?: string;
	SubscribeURL?: string;
	Token?: string;
}

const SNS_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com$/;

/** True for an HTTPS URL on an SNS endpoint (certificates and subscribe links). */
export function isSnsUrl(raw: string, pathEnd = ''): boolean {
	try {
		const url = new URL(raw);
		return (
			url.protocol === 'https:' && SNS_HOST.test(url.hostname) && url.pathname.endsWith(pathEnd)
		);
	} catch {
		return false;
	}
}

const SIGNED_KEYS = {
	Notification: ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'],
	SubscriptionConfirmation: [
		'Message',
		'MessageId',
		'SubscribeURL',
		'Timestamp',
		'Token',
		'TopicArn',
		'Type'
	],
	UnsubscribeConfirmation: [
		'Message',
		'MessageId',
		'SubscribeURL',
		'Timestamp',
		'Token',
		'TopicArn',
		'Type'
	]
} as const;

/** The string SNS signs: "Key\nValue\n" for each present key, in this order. */
export function canonicalString(m: SnsMessage): string {
	return SIGNED_KEYS[m.Type]
		.filter((k) => m[k] !== undefined)
		.map((k) => `${k}\n${m[k]}\n`)
		.join('');
}

const certCache = new Map<string, string>();

async function fetchCert(url: string): Promise<string> {
	const cached = certCache.get(url);
	if (cached) return cached;
	const res = await fetch(url, { redirect: 'error' });
	if (!res.ok) throw new Error(`SNS certificate fetch failed: ${res.status}`);
	const pem = await res.text();
	certCache.set(url, pem);
	return pem;
}

export type CertFetcher = (url: string) => Promise<string>;

/**
 * Parses and verifies an SNS request body. Returns the message, or null if it
 * isn't a genuine message for `topicArn`.
 */
export async function verifySnsMessage(
	body: unknown,
	topicArn: string | undefined,
	getCert: CertFetcher = fetchCert
): Promise<SnsMessage | null> {
	const m = body as Partial<SnsMessage> | null;
	if (!m || typeof m !== 'object' || !topicArn) return null;
	if (!m.Type || !(m.Type in SIGNED_KEYS)) return null;
	if (m.TopicArn !== topicArn) return null;
	if (typeof m.Signature !== 'string' || typeof m.SigningCertURL !== 'string') return null;
	if (!isSnsUrl(m.SigningCertURL, '.pem')) return null;
	const algorithm =
		m.SignatureVersion === '2' ? 'RSA-SHA256' : m.SignatureVersion === '1' ? 'RSA-SHA1' : null;
	if (!algorithm) return null;
	const msg = m as SnsMessage;
	if (msg.Type !== 'Notification' && !isSnsUrl(msg.SubscribeURL ?? '')) return null;
	try {
		const cert = await getCert(msg.SigningCertURL);
		const ok = createVerify(algorithm)
			.update(canonicalString(msg), 'utf8')
			.verify(cert, msg.Signature, 'base64');
		return ok ? msg : null;
	} catch {
		return null;
	}
}

/** Confirms a verified subscription by visiting its SubscribeURL once. */
export async function confirmSubscription(m: SnsMessage): Promise<void> {
	if (!m.SubscribeURL || !isSnsUrl(m.SubscribeURL)) throw new Error('Bad SubscribeURL');
	const res = await fetch(m.SubscribeURL, { redirect: 'error' });
	if (!res.ok) throw new Error(`SNS subscription confirm failed: ${res.status}`);
}
