// Delivery providers for push, SMS and email (notifications.md §5-7).
//
// Today: email goes through SMTP (Mailpit locally: SMTP_URL=smtp://localhost:1025),
// push and SMS go to a console driver that logs only the notification ID and
// channel. The production drivers (FCM, AWS End User Messaging SMS, Amazon
// SES) plug in here behind the same interface once those accounts exist.
//
// Everything sent through here is PHI-free by construction: titles and bodies
// come from templates.ts, never from clinical records.
import nodemailer, { type Transporter } from 'nodemailer';

export interface Delivery {
	notificationId: string;
	title: string;
	body: string;
	/** App path to open, e.g. /notifications/<id> */
	link: string;
}

export interface SendResult {
	providerMessageId: string;
}

export interface Providers {
	push(tokens: string[], d: Delivery): Promise<SendResult>;
	sms(phone: string, d: Delivery): Promise<SendResult>;
	email(to: string, d: Delivery): Promise<SendResult>;
}

const consoleSend = (channel: string) => async (_to: unknown, d: Delivery) => {
	console.log(`[dev ${channel}] notification ${d.notificationId}`);
	return { providerMessageId: `dev-${channel}-${d.notificationId}` };
};

let smtp: Transporter | undefined;

async function emailViaSmtp(to: string, d: Delivery): Promise<SendResult> {
	const url = process.env.SMTP_URL;
	if (!url) return consoleSend('email')(to, d);
	smtp ??= nodemailer.createTransport(url);
	const appUrl = process.env.APP_URL ?? 'http://localhost:5173';
	const info = await smtp.sendMail({
		from: process.env.SES_FROM_ADDRESS ?? 'Guad <no-reply@guad.test>',
		to,
		subject: `Guad: ${d.title}`,
		text: `${d.body}\n\n${appUrl}${d.link}`
	});
	return { providerMessageId: info.messageId };
}

let override: Partial<Providers> | undefined;

/** Tests swap in recording fakes. */
export function setProvidersForTests(p: Partial<Providers> | undefined) {
	override = p;
}

export function providers(): Providers {
	return {
		push: override?.push ?? consoleSend('push'),
		sms: override?.sms ?? consoleSend('sms'),
		email: override?.email ?? emailViaSmtp
	};
}
