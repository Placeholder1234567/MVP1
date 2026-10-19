import { test, expect } from '@playwright/test';

test('the daily summary suggests operational next steps that link to the work', async ({
	page
}) => {
	test.setTimeout(120000);
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('supervisor@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	const confirm = page.getByLabel('Confirm PIN', { exact: true });
	if (await confirm.isVisible()) await confirm.fill('654321');
	await page.getByRole('button', { name: /^(Save PIN and open|Unlock)$/ }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Oak House' });
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	await page.getByRole('link', { name: 'Overview', exact: true }).first().click();

	await page.getByRole('button', { name: /^(Summarize today|Refresh summary)$/ }).click();
	const heading = page.getByRole('heading', { name: 'Suggested next steps', exact: true });
	await expect(heading).toBeVisible();
	const links = heading.locator('xpath=following-sibling::ul[1]').getByRole('link');
	await expect(links.first()).toBeVisible();
	expect(await links.count()).toBeLessThanOrEqual(3);
	for (const text of await links.allTextContents())
		expect(text).toMatch(/^(Review|Look at|Check|Confirm|Fill|Remind staff)/);
});
