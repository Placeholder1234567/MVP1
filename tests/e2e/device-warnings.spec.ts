import { test, expect } from '@playwright/test';

test('a device using a lot of storage gets a warning', async ({ page }) => {
	test.setTimeout(120000);
	// Pretend Guad's storage on this device has grown to 90 MB.
	await page.addInitScript(() => {
		const storage = navigator.storage;
		if (storage)
			Object.defineProperty(storage, 'estimate', {
				value: async () => ({ usage: 90 * 1024 * 1024, quota: 2048 * 1024 * 1024 })
			});
	});
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('cara@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	const confirm = page.getByLabel('Confirm PIN', { exact: true });
	if (await confirm.isVisible()) await confirm.fill('654321');
	await page.getByRole('button', { name: /^(Save PIN and open|Unlock)$/ }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await expect(page.getByTestId('device-warning')).toHaveText(
		/Guad is using a lot of storage on this device/
	);
});
