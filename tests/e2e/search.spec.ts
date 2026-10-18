import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

test('search finds people and pages on the device and opens them', async ({ page }, info) => {
	test.setTimeout(180000);
	const phone = info.project.name === 'phone';
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('supervisor@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');

	const open = async () => {
		if (phone) await page.getByRole('button', { name: 'Search', exact: true }).click();
		else await page.keyboard.press('Control+k');
		await expect(page.getByRole('dialog', { name: 'Search' })).toBeVisible();
	};
	const box = page.getByRole('combobox', { name: /^Search people/ });

	await open();
	await expect(box).toBeFocused();
	// Accents and case don't matter.
	await box.fill('demo');
	await box.fill('ROSÁ');
	const result = page.getByRole('option', { name: /^Rosa Demo/ });
	await expect(result).toBeVisible();
	const axe = await new AxeBuilder({ page }).include('dialog').analyze();
	expect(axe.violations).toEqual([]);
	// Other tests' notes may mention Rosa too, and supervisors see notes first.
	await result.click();
	await expect(page.getByRole('dialog', { name: 'Search' })).toBeHidden();
	await expect(page).toHaveURL(/\/dashboard\/people\/[0-9a-f-]{36}$/);

	// Pages come first, so the first result is chosen with Enter.
	await open();
	await box.fill('timesh');
	const first = page.getByRole('option', { name: /^Timesheets/ });
	await expect(first).toHaveAttribute('aria-selected', 'true');
	await box.press('ArrowDown');
	await box.press('ArrowUp');
	await expect(first).toHaveAttribute('aria-selected', 'true');
	await box.press('Enter');
	await expect(page).toHaveURL(/\/dashboard\/timesheets$/);

	await open();
	await box.fill('zzzz no match');
	await expect(page.getByText('Nothing on this device matches.', { exact: true })).toBeVisible();
	await box.press('Escape');
	await expect(page.getByRole('dialog', { name: 'Search' })).toBeHidden();
});
