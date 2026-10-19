import { test, expect } from '@playwright/test';

// A new version waits until the person taps Refresh (frontend-spec-2.md
// §8.5), and never while a form has unsaved changes. The "new version" is
// the same worker under another script URL, which the browser installs as an
// update to the registration.
test('an update waits for Refresh and for unsaved work to be saved', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop', 'One run is enough for the service worker update.');
	test.setTimeout(180000);
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('cara@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Oak House' });
	await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

	// Unsaved work on screen.
	await page.getByRole('link', { name: /Rosa Demo/ }).click();
	await page.getByRole('link', { name: /^Shift note/ }).click();
	await page
		.getByLabel('Activities', { exact: true })
		.fill('Synthetic activity typed before an app update.');

	// Same scope, new script URL: the browser installs it as an update.
	await page.evaluate(async () => {
		await navigator.serviceWorker.register('/service-worker.js?next=1', { type: 'module' });
	});
	const toast = page.getByTestId('update-toast');
	await expect(toast).toContainText('Update available');
	await toast.getByRole('button', { name: 'Refresh', exact: true }).click();
	await expect(toast).toContainText('Save your draft first, then refresh.');

	await page.getByRole('button', { name: 'Save draft', exact: true }).click();
	await expect(page.getByText('Draft saved on this device.', { exact: true })).toBeVisible();
	await Promise.all([
		page.waitForEvent('load'),
		toast.getByRole('button', { name: 'Refresh', exact: true }).click()
	]);
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeVisible();
	await expect(page.getByTestId('update-toast')).toHaveCount(0);
});
