// Device PIN bound to a platform passkey (WebAuthn PRF) where the device can,
// research/decisions-2026-10.md §3. The test server runs on 127.0.0.1, and
// WebAuthn refuses IP-address origins, so here the passkey can't be made even
// though Chromium's virtual authenticator offers PRF: setup and unlock must
// fall back to the PIN alone, never block. The passkey path itself is covered
// by tests/unit/device/passkey-unlock.test.ts.
import { expect, test } from '@playwright/test';

test('a device that cannot make a passkey still sets up and unlocks with the PIN', async ({
	page
}, info) => {
	test.skip(info.project.name !== 'desktop', 'One run is enough for the unlock flow.');
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('WebAuthn.enable');
	const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
		options: {
			protocol: 'ctap2',
			transport: 'internal',
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: true,
			hasPrf: true,
			automaticPresenceSimulation: true
		}
	});

	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('cara@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByText(/may also ask for its screen lock/)).toBeVisible();
	await page.getByLabel('Device PIN', { exact: true }).fill('246810');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('246810');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();

	const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
	expect(credentials).toHaveLength(0);
	const passkey = await page.evaluate(async () => {
		const dir = await navigator.storage.getDirectory();
		for await (const [name, handle] of dir as unknown as AsyncIterable<
			[string, FileSystemFileHandle]
		>) {
			if (!/^guad-device-.+\.json$/.test(name)) continue;
			const record = JSON.parse(await (await handle.getFile()).text());
			if (record.wrapped) return record.passkey ?? null;
		}
		return 'no wrapped key';
	});
	expect(passkey).toBeNull();

	await page.reload();
	await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
	await page.getByLabel('Device PIN', { exact: true }).fill('246810');
	await page.getByRole('button', { name: 'Unlock', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
});
