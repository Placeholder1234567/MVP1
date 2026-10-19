// "Forgot password?": emails a link to the set-password page. The answer is
// the same whether or not the address has an account, and the email is sent
// in the background, so the page can't be used to find out who works where.
// Links use APP_URL, never the request's Host header, so a forged host can't
// point a reset link at another site.
import { fail } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { activeIdentityByEmail, passwordSetupLink } from '#lib/server/identity.ts';
import { providers } from '#lib/server/messaging/index.ts';
import { resetsByEmail, resetsByIp } from '#lib/server/rate-limit.ts';
import type { Actions } from './$types';

const appUrl = () => process.env.APP_URL ?? 'http://localhost:5173';

async function sendResetEmail(email: string) {
	const account = await activeIdentityByEmail(email);
	if (!account) return;
	const link = await passwordSetupLink(email, appUrl());
	await providers().email(email, {
		notificationId: `reset-${randomUUID()}`,
		title: 'Reset your Guad password',
		body: `Someone asked to reset the password for this Guad account. If it was you, set a new one here (the link expires in an hour):\n\n${link}\n\nIf it wasn't you, ignore this email. Your password stays the same.`,
		link: '/login'
	});
}

export const actions: Actions = {
	default: async ({ request, getClientAddress }) => {
		const parsed = z
			.email()
			.max(254)
			.safeParse(
				String((await request.formData()).get('email') ?? '')
					.trim()
					.toLowerCase()
			);
		if (!parsed.success) return fail(400, { message: 'Enter the email you sign in with.' });
		if (resetsByIp.take(getClientAddress()))
			return fail(429, { message: 'Too many requests. Wait a few minutes and try again.' });
		// Over the per-address limit: answer the same way, just don't send again.
		if (!resetsByEmail.take(parsed.data))
			sendResetEmail(parsed.data).catch((e) =>
				console.warn('password.reset_email_failed', (e as Error).name)
			);
		return { sent: true };
	}
};
