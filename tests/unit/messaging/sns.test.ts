import { createSign, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	canonicalString,
	isSnsUrl,
	verifySnsMessage,
	type SnsMessage
} from '../../../src/lib/server/messaging/sns';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const topic = 'arn:aws:sns:us-east-1:000000000000:guad-ses-events';
const certUrl = 'https://sns.us-east-1.amazonaws.com/SimpleNotificationService-test.pem';
const certs = async (url: string) => {
	if (url !== certUrl) throw new Error('unexpected certificate URL');
	return pem;
};

function signed(fields: Partial<SnsMessage> = {}, version: '1' | '2' = '2'): SnsMessage {
	const m = {
		Type: 'Notification',
		MessageId: 'msg-1',
		TopicArn: topic,
		Message: JSON.stringify({ eventType: 'Bounce' }),
		Timestamp: '2026-10-15T12:00:00.000Z',
		SignatureVersion: version,
		SigningCertURL: certUrl,
		Signature: '',
		...fields
	} as SnsMessage;
	m.Signature = createSign(version === '2' ? 'RSA-SHA256' : 'RSA-SHA1')
		.update(canonicalString(m))
		.sign(privateKey, 'base64');
	return m;
}

describe('SNS message verification', () => {
	it('accepts a correctly signed message for the configured topic', async () => {
		expect(await verifySnsMessage(signed(), topic, certs)).not.toBeNull();
		expect(await verifySnsMessage(signed({}, '1'), topic, certs)).not.toBeNull();
	});

	it('signs Subject only when present', () => {
		expect(canonicalString(signed())).not.toContain('Subject');
		expect(canonicalString(signed({ Subject: 'Hi' }))).toContain('Subject\nHi\n');
	});

	it('rejects tampered messages', async () => {
		const m = signed();
		m.Message = JSON.stringify({ eventType: 'Complaint' });
		expect(await verifySnsMessage(m, topic, certs)).toBeNull();
	});

	it('rejects other topics and missing configuration', async () => {
		expect(await verifySnsMessage(signed(), `${topic}-other`, certs)).toBeNull();
		expect(await verifySnsMessage(signed(), undefined, certs)).toBeNull();
	});

	it('rejects certificates not served by SNS over HTTPS', async () => {
		for (const url of [
			'http://sns.us-east-1.amazonaws.com/cert.pem',
			'https://sns.us-east-1.amazonaws.com.evil.test/cert.pem',
			'https://evil.test/sns.us-east-1.amazonaws.com/cert.pem',
			'https://sns.us-east-1.amazonaws.com/cert.txt'
		]) {
			expect(isSnsUrl(url, '.pem')).toBe(false);
			expect(await verifySnsMessage(signed({ SigningCertURL: url }), topic, certs)).toBeNull();
		}
	});

	it('rejects junk and subscription confirmations with a foreign SubscribeURL', async () => {
		expect(await verifySnsMessage(null, topic, certs)).toBeNull();
		expect(await verifySnsMessage({ Type: 'Notification' }, topic, certs)).toBeNull();
		const confirm = signed({
			Type: 'SubscriptionConfirmation',
			Token: 't',
			SubscribeURL: 'https://evil.test/confirm'
		});
		expect(await verifySnsMessage(confirm, topic, certs)).toBeNull();
	});
});
