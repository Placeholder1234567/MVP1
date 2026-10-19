// Sets a password from an invite or reset link (identity.ts passwordSetupLink).
// The server checks it first: length (NIST 800-63B-4, no character-type rules)
// and the breached-password list, then sets it through Identity Platform and
// signs the account out everywhere else.
import { fail } from '@sveltejs/kit';
import * as env from '$app/env/public';
import { passwordProblem } from '#lib/domain/password.ts';
import { breachCount } from '#lib/server/pwned.ts';
import { passwordSetsByIp } from '#lib/server/rate-limit.ts';
import { checkResetCode, ResetCodeError, setPasswordWithCode } from '#lib/server/identity.ts';
import type { Actions, PageServerLoad } from './$types';

const apiKey = () => env.PUBLIC_FIREBASE_API_KEY || 'demo-key';

const codeMessage = (e: unknown) =>
	e instanceof ResetCodeError && e.code === 'expired'
		? 'This link has expired. Ask your admin for a new invite, or use “Forgot password?” on the sign-in page.'
		: e instanceof ResetCodeError && e.code === 'disabled'
			? 'This account is turned off. Ask your agency admin.'
			: 'This link has already been used or isn’t valid. Use “Forgot password?” on the sign-in page for a new one.';

export const load: PageServerLoad = async ({ url }) => {
	const code = url.searchParams.get('code');
	if (!code) return { email: null, problem: codeMessage(null) };
	try {
		const { email } = await checkResetCode(apiKey(), code);
		return { email, problem: null };
	} catch (e) {
		if (!(e instanceof ResetCodeError)) throw e;
		return { email: null, problem: codeMessage(e) };
	}
};

export const actions: Actions = {
	default: async ({ request, url, getClientAddress }) => {
		if (passwordSetsByIp.take(getClientAddress()))
			return fail(429, { message: 'Too many tries. Wait a few minutes and try again.' });
		const form = await request.formData();
		const code = url.searchParams.get('code') ?? '';
		const password = String(form.get('password') ?? '');
		if (password !== String(form.get('confirm') ?? ''))
			return fail(400, { message: 'The two passwords don’t match.' });
		let email: string;
		try {
			({ email } = await checkResetCode(apiKey(), code));
		} catch (e) {
			if (!(e instanceof ResetCodeError)) throw e;
			return fail(400, { message: codeMessage(e) });
		}
		const problem = passwordProblem(password, email);
		if (problem) return fail(400, { message: problem });
		if (await breachCount(password))
			return fail(400, {
				message:
					'This password has appeared in a data breach, so it’s easy to guess. Choose a different one.'
			});
		try {
			await setPasswordWithCode(apiKey(), code, password);
		} catch (e) {
			if (!(e instanceof ResetCodeError)) throw e;
			return fail(400, {
				message: e.code === 'weak' ? 'Choose a longer password.' : codeMessage(e)
			});
		}
		return { done: true };
	}
};
