import { test, expect } from '@playwright/test';

// Case notes (US-15): a supervisor files a note under a category and reads
// the history by kind.
test('a supervisor saves a case note under a category and filters the history', async ({
	page
}, info) => {
	test.skip(info.project.name !== 'desktop', 'One run is enough for a supervisor form.');
	test.setTimeout(180000);
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('supervisor@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');

	await page.getByRole('link', { name: 'People', exact: true }).first().click();
	await page
		.getByRole('link', { name: /Rosa Demo/ })
		.first()
		.click();
	await page.waitForURL(/\/dashboard\/people\/[0-9a-f-]{36}$/);

	const text = `Annual ISP meeting with the team (synthetic ${Date.now()})`;
	await page.getByRole('combobox', { name: /^About/ }).selectOption({ label: 'ISP meeting' });
	await page.getByRole('textbox', { name: /^New case note/ }).fill(text);
	await page.getByRole('button', { name: 'Save case note', exact: true }).click();
	await expect(page.getByText('Case note saved.', { exact: true })).toBeVisible();

	const history = page.getByRole('group', { name: 'Case note history', exact: true });
	const row = history.locator('.row').filter({ hasText: text });
	await expect(row).toContainText('ISP meeting');

	const show = page.getByRole('combobox', { name: /^Show/ });
	await show.selectOption({ label: 'Family contact' });
	await expect(row).toBeHidden();
	await show.selectOption({ label: 'ISP meeting' });
	await expect(row).toBeVisible();
});
