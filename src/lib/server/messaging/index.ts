// Delivery providers for push, SMS and email (notifications.md §5-7).
//
// Each channel's driver is picked by an environment variable:
//   PUSH_DRIVER  = console (default) | fcm   Firebase Cloud Messaging
//   EMAIL_DRIVER = smtp (default)    | ses   Amazon SES
//   SMS_DRIVER   = console (default) | aws   AWS End User Messaging SMS
// Locally email goes to Mailpit (SMTP_URL=smtp://localhost:1025), and the
// console driver logs only the notification ID and channel. The production
// drivers are in drivers.ts.
//
// Everything sent through here is PHI-free by construction: titles and bodies
// come from templates.ts, never from clinical records.
import nodemailer, { type Transporter } from 'nodemailer';
import { emailViaSes, pushViaFcm, smsViaAws } from './drivers.ts';

export interface Delivery {
	notificationId: string;
	title: string;
	body: string;
	/** App path to open, e.g. /notifications/<id> */
	link: string;
}

export interface SendResult {
	providerMessageId: string;
	/** Push tokens the provider says will never work again (to delete). */
	deadTokens?: string[];
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

function pick<T>(name: string, drivers: Record<string, T>, fallback: string): T {
	const driver = drivers[process.env[name] || fallback];
	if (!driver) throw new Error(`${name} must be one of: ${Object.keys(drivers).join(', ')}`);
	return driver;
}

export function providers(): Providers {
	return {
		push:
			override?.push ??
			pick('PUSH_DRIVER', { console: consoleSend('push'), fcm: pushViaFcm }, 'console'),
		sms:
			override?.sms ??
			pick('SMS_DRIVER', { console: consoleSend('sms'), aws: smsViaAws }, 'console'),
		email: override?.email ?? pick('EMAIL_DRIVER', { smtp: emailViaSmtp, ses: emailViaSes }, 'smtp')
	};
}
