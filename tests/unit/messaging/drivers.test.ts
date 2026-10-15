import { afterEach, describe, expect, it, vi } from 'vitest';

const fcm = vi.hoisted(() => ({ sendEachForMulticast: vi.fn() }));
const aws = vi.hoisted(() => ({ ses: vi.fn(), sms: vi.fn() }));

vi.mock('firebase-admin/app', () => ({ getApps: () => [{}], initializeApp: vi.fn() }));
vi.mock('firebase-admin/messaging', () => ({ getMessaging: () => fcm }));
vi.mock('@aws-sdk/client-sesv2', () => ({
	SESv2Client: class {
		send = aws.ses;
	},
	SendEmailCommand: class {
		constructor(public input: unknown) {}
	}
}));
vi.mock('@aws-sdk/client-pinpoint-sms-voice-v2', () => ({
	PinpointSMSVoiceV2Client: class {
		send = aws.sms;
	},
	SendTextMessageCommand: class {
		constructor(public input: unknown) {}
	}
}));

const { providers } = await import('../../../src/lib/server/messaging');
const { emailViaSes, pushViaFcm, smsViaAws } =
	await import('../../../src/lib/server/messaging/drivers');

const d = {
	notificationId: 'n-1',
	title: 'Review required',
	body: 'Open Guad to see details.',
	link: '/notifications/n-1'
};

afterEach(() => {
	vi.unstubAllEnvs();
	vi.clearAllMocks();
});

describe('driver selection', () => {
	it('defaults to the local drivers and rejects unknown names', () => {
		vi.stubEnv('PUSH_DRIVER', '');
		expect(providers().push).not.toBe(pushViaFcm);
		vi.stubEnv('PUSH_DRIVER', 'fcm');
		vi.stubEnv('EMAIL_DRIVER', 'ses');
		vi.stubEnv('SMS_DRIVER', 'aws');
		const p = providers();
		expect([p.push, p.email, p.sms]).toEqual([pushViaFcm, emailViaSes, smsViaAws]);
		vi.stubEnv('SMS_DRIVER', 'other');
		expect(() => providers()).toThrow('SMS_DRIVER must be one of: console, aws');
	});
});

describe('FCM push', () => {
	it('sends a generic web push and reports dead tokens', async () => {
		fcm.sendEachForMulticast.mockResolvedValue({
			responses: [
				{ success: true, messageId: 'fcm-1' },
				{ success: false, error: { code: 'messaging/registration-token-not-registered' } },
				{ success: false, error: { code: 'messaging/internal-error' } }
			]
		});
		const res = await pushViaFcm(['a', 'b', 'c'], d);
		expect(res).toEqual({ providerMessageId: 'fcm-1', deadTokens: ['b'] });
		const msg = fcm.sendEachForMulticast.mock.calls[0][0];
		expect(msg.tokens).toEqual(['a', 'b', 'c']);
		expect(msg.webpush.notification).toMatchObject({ title: d.title, body: d.body });
		expect(msg.webpush.fcmOptions.link).toMatch(/\/notifications\/n-1$/);
	});

	it('fails when no device accepted it, still naming dead tokens', async () => {
		fcm.sendEachForMulticast.mockResolvedValue({
			responses: [{ success: false, error: { code: 'messaging/invalid-registration-token' } }]
		});
		await expect(pushViaFcm(['a'], d)).rejects.toMatchObject({ deadTokens: ['a'] });
	});
});

describe('AWS email and SMS', () => {
	it('sends email through SES with the configuration set', async () => {
		vi.stubEnv('AWS_REGION', 'us-east-1');
		vi.stubEnv('AWS_ACCESS_KEY_ID', 'test');
		vi.stubEnv('SES_CONFIGURATION_SET', 'guad-events');
		aws.ses.mockResolvedValue({ MessageId: 'ses-1' });
		expect(await emailViaSes('synthetic@example.test', d)).toEqual({ providerMessageId: 'ses-1' });
		const { input } = aws.ses.mock.calls[0][0];
		expect(input.Destination.ToAddresses).toEqual(['synthetic@example.test']);
		expect(input.ConfigurationSetName).toBe('guad-events');
		expect(input.Content.Simple.Subject.Data).toBe('Guad: Review required');
	});

	it('sends transactional SMS from the origination identity, at most 160 characters', async () => {
		vi.stubEnv('AWS_REGION', 'us-east-1');
		vi.stubEnv('AWS_ACCESS_KEY_ID', 'test');
		vi.stubEnv('SMS_ORIGINATION_IDENTITY', 'phone-number-id');
		aws.sms.mockResolvedValue({ MessageId: 'sms-1' });
		const res = await smsViaAws('+15555550100', { ...d, body: 'x'.repeat(200) });
		expect(res).toEqual({ providerMessageId: 'sms-1' });
		const { input } = aws.sms.mock.calls[0][0];
		expect(input).toMatchObject({
			DestinationPhoneNumber: '+15555550100',
			OriginationIdentity: 'phone-number-id',
			MessageType: 'TRANSACTIONAL'
		});
		expect(input.MessageBody).toHaveLength(160);
	});
});
