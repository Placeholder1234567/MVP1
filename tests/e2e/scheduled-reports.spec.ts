import { test, expect } from '@playwright/test';

// Scheduled care reports (Complete plan): a supervisor asks for a weekly
// report for their home, sees when it runs next, and removes it.
test('a supervisor schedules a weekly report and removes it', async ({ page }, info) => {
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

	await page.getByRole('link', { name: 'Reports', exact: true }).first().click();
	await page.getByRole('link', { name: 'Prepare a larger care report →', exact: true }).click();
	await page.waitForURL(/\/dashboard\/reports\/background$/);
	const form = page.getByRole('form', { name: 'Schedule a report' });
	await form
		.getByRole('combobox', { name: /^Report to schedule/ })
		.selectOption({ label: 'Incident log' });
	await form.getByRole('combobox', { name: /^Day/ }).selectOption({ label: 'Friday' });
	await form.getByRole('button', { name: 'Schedule report', exact: true }).click();
	await expect(page.getByText(/^Scheduled\. You’ll get an alert/)).toBeVisible();

	const list = page.getByRole('group', { name: 'Your scheduled reports', exact: true });
	const row = list.locator('.row').filter({ hasText: 'Incident log' });
	await expect(row).toContainText('Every Friday');
	await expect(row).toContainText(/Next: \d{4}-\d{2}-\d{2}/);
	await row.getByRole('button', { name: /^Remove Incident log schedule/ }).click();
	await expect(page.getByText('Scheduled report removed.', { exact: true })).toBeVisible();
	await expect(row).toHaveCount(0);
});
