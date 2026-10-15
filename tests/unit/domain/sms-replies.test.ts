import { describe, expect, it } from 'vitest';
import { offerCode, parseSmsReply, SMS_REPLY_TEXT } from '../../../src/lib/domain';
import { render } from '../../../src/lib/server/messaging/templates';

describe('parseSmsReply', () => {
	it('reads yes/no words with an optional offer code', () => {
		expect(parseSmsReply('yes')).toEqual({ kind: 'answer', reply: 'accepted' });
		expect(parseSmsReply(' Sure! ')).toEqual({ kind: 'answer', reply: 'accepted' });
		expect(parseSmsReply('YES 4821')).toEqual({ kind: 'answer', reply: 'accepted', code: '4821' });
		expect(parseSmsReply('no, 4821')).toEqual({ kind: 'answer', reply: 'declined', code: '4821' });
		expect(parseSmsReply('Can’t')).toEqual({ kind: 'answer', reply: 'declined' });
	});

	it('treats anything else as not understood', () => {
		for (const body of ['', 'maybe', 'yes please', 'YES 12', 'call me', 'ok 1234 5678'])
			expect(parseSmsReply(body)).toEqual({ kind: 'unknown' });
	});

	it('recognizes opt-out and opt-in keywords', () => {
		expect(parseSmsReply('STOP')).toEqual({ kind: 'stop' });
		expect(parseSmsReply('unsubscribe')).toEqual({ kind: 'stop' });
		expect(parseSmsReply('Start')).toEqual({ kind: 'start' });
	});
});

describe('offer codes', () => {
	it('are stable 4-digit codes per request', () => {
		const id = '0b5e4c7a-8f61-4f0e-9d7e-2a1c3b4d5e6f';
		expect(offerCode(id)).toMatch(/^[1-9]\d{3}$/);
		expect(offerCode(id)).toBe(offerCode(id));
		expect(offerCode(id)).not.toBe(offerCode('1b5e4c7a-8f61-4f0e-9d7e-2a1c3b4d5e6f'));
	});

	it('appear in the coverage offer SMS, which stays one plain-ASCII segment', () => {
		const referenceId = '0b5e4c7a-8f61-4f0e-9d7e-2a1c3b4d5e6f';
		const d = render('sms', {
			id: 'n-1',
			title: 'Shift available · 2026-10-16 PM',
			type: 'coverage_offer',
			referenceId
		});
		const code = offerCode(referenceId);
		expect(d.body).toBe(`Guad: Shift available 2026-10-16 PM. Reply YES ${code} or NO ${code}.`);
		expect(d.body).toMatch(/^[\x20-\x7e]{1,160}$/);
		expect(render('sms', { id: 'n-2', title: 'Health alert' }).body).toBe(
			'Guad: Health alert. Open the app to review.'
		);
	});

	it('keeps every reply text within one segment', () => {
		const texts = Object.values(SMS_REPLY_TEXT).map((t) => (typeof t === 'function' ? t(12) : t));
		for (const t of texts) expect(t.length).toBeLessThanOrEqual(160);
	});
});
