import { test, expect } from '@playwright/test';

// One tab at a time owns the encrypted device database (offline-sync.md test
// 10). A second tab says so instead of hanging, and opens once the first goes.
test('a second tab waits for the first instead of hanging', async ({ page, context }) => {
	test.setTimeout(120000);
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('cara@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');

	const second = await context.newPage();
	await second.goto('/today');
	await second.getByLabel('Device PIN', { exact: true }).fill('654321');
	await second.getByRole('button', { name: 'Unlock', exact: true }).click();
	await expect(second.getByText(/Guad is open in another tab/)).toBeVisible();
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');

	// Closing the first tab frees the database; the second opens by itself.
	await page.close();
	await expect(second.getByTestId('sync-status')).toHaveText('All changes synced');
	await expect(second.getByText(/Guad is open in another tab/)).toBeHidden();
});
