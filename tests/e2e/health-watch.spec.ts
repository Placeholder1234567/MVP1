import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

// Lomi's health watch (charting-guide.md §3c): a fever with a fast pulse is a
// sepsis sign the supervisor sees on the overview and the person's page.
test('a fever with a fast pulse shows as a sepsis sign to supervisors', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop', 'One run is enough for a supervisor desktop card.');
	test.setTimeout(180000);
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('supervisor@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Maple House' });
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');

	await page.getByRole('link', { name: 'Care records', exact: true }).first().click();
	await page.getByRole('link', { name: /Theo Demo/ }).click();
	await page.getByRole('link', { name: /^Health Vitals/ }).click();
	await page.getByLabel('Temperature', { exact: true }).fill('101.5');
	await page.getByLabel('Pulse', { exact: true }).fill('117');
	await page.getByRole('button', { name: 'Save vitals', exact: true }).click();
	await expect(page.getByText(/^Vitals saved for /)).toBeVisible();

	await page.getByRole('link', { name: 'Overview', exact: true }).first().click();
	const watch = page.getByRole('region', { name: 'Lomi’s health watch' });
	const theo = watch.getByRole('article', { name: 'Theo Demo' });
	await expect(theo.getByText('Sepsis', { exact: false })).toBeVisible();
	await expect(theo).toContainText('Fever 101.5°F with pulse 117');
	const axe = await new AxeBuilder({ page }).include('section.watch').analyze();
	expect(axe.violations).toEqual([]);

	await theo.getByRole('link', { name: 'Theo Demo' }).click();
	await expect(page).toHaveURL(/\/dashboard\/people\/[0-9a-f-]{36}$/);
	await expect(
		page
			.getByRole('region', { name: 'Lomi’s health watch' })
			.getByText(/Fever 101\.5°F with pulse 117/)
	).toBeVisible();
});
