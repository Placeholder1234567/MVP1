import { test, expect } from '@playwright/test';

// The Auth emulator and Mailpit from the local stack (docker-compose.yml).
const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'}/identitytoolkit.googleapis.com/v1`;
const MAILPIT = 'http://localhost:8025/api/v1';

async function resetCode(email: string): Promise<string> {
	for (let i = 0; i < 40; i++) {
		const list = await (
			await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:"${email}"`)}`)
		).json();
		const id = list.messages?.[0]?.ID;
		if (id) {
			const message = await (await fetch(`${MAILPIT}/message/${id}`)).json();
			const code = /set-password\?code=([^\s&]+)/.exec(message.Text)?.[1];
			if (code) return decodeURIComponent(code);
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	throw new Error('No reset email arrived');
}

test('forgot password emails a link; the new password must be long enough', async ({
	page
}, info) => {
	test.setTimeout(120000);
	// A throwaway sign-in in the emulator, so seeded accounts keep their password.
	const email = `reset-${info.project.name}-${Date.now()}@example.test`;
	const created = await fetch(`${AUTH}/accounts:signUp?key=demo-key`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email, password: 'old password long enough' })
	});
	expect(created.ok).toBe(true);

	await page.goto('/login');
	await page.getByRole('link', { name: 'Forgot password?', exact: true }).click();
	await page.getByLabel('Email', { exact: true }).fill(email);
	await page.getByRole('button', { name: 'Send reset link', exact: true }).click();
	await expect(page.getByRole('status')).toContainText('If that email has a Guad account');

	await page.goto(`/set-password?code=${encodeURIComponent(await resetCode(email))}`);
	await expect(page.getByText(email)).toBeVisible();
	const password = page.getByLabel('New password', { exact: true });
	const confirm = page.getByLabel('Type it again', { exact: true });
	// Below the browser's minlength check, so this tests the server's rule.
	await password.evaluate((el) => el.removeAttribute('minlength'));
	await confirm.evaluate((el) => el.removeAttribute('minlength'));
	await password.fill('too short');
	await confirm.fill('too short');
	await page.getByRole('button', { name: 'Save password', exact: true }).click();
	await expect(page.getByRole('alert')).toContainText('at least 15 characters');

	await password.fill('lemon tea on the porch');
	await confirm.fill('lemon tea on the porch');
	await page.getByRole('button', { name: 'Save password', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Password saved' })).toBeVisible();

	const signIn = await fetch(`${AUTH}/accounts:signInWithPassword?key=demo-key`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email, password: 'lemon tea on the porch' })
	});
	expect(signIn.ok).toBe(true);

	// The link works once.
	await page.reload();
	await expect(page.getByRole('alert')).toContainText('already been used');
});
