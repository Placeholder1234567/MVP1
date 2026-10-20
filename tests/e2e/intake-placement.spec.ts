import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// A stalled action must fail early enough to retain the runner's full error report.
test.use({ actionTimeout: 30000 });

test('explicit placement needs survive reload and keep human comparison guidance', async ({
	page
}, info) => {
	test.setTimeout(180000);
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('admin@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	await page.getByRole('button', { name: 'Search', exact: true }).click();
	await page.getByRole('combobox', { name: /^Search people/ }).fill('intake');
	await page
		.getByRole('option', { name: /^Intake/ })
		.first()
		.click();
	await page.getByRole('button', { name: 'New referral', exact: true }).click();
	const name = `Synthetic placement ${info.project.name} ${Date.now()}`;
	await page.getByLabel('Client name', { exact: true }).fill(name);
	await page
		.getByLabel('Intake notes', { exact: true })
		.fill('Synthetic narrative mentions medication support.');
	const need = page.getByLabel('Medication-certified staff need', { exact: true });
	await expect(need).toHaveValue('unknown');
	await page.getByRole('button', { name: 'Create referral', exact: true }).click();
	await expect(page.getByText('Referral saved.', { exact: true })).toBeVisible();
	await page.getByLabel('Stage', { exact: true }).selectOption('accepted');
	await Promise.all([
		page.waitForResponse(
			(r) =>
				r.url().includes('/intake.updateReferral') &&
				r.request().method() === 'POST' &&
				r.status() === 200
		),
		page.getByRole('button', { name: 'Save referral', exact: true }).click()
	]);
	const guidance = page.getByRole('group', {
		name: 'Placement availability guidance',
		exact: true
	});
	await expect(guidance).toContainText('Needs review · incomplete information');
	await expect(guidance).toContainText('Human review is required.');
	await expect(guidance).toContainText('active assigned medication-certified caregivers');
	await need.selectOption('required');
	await Promise.all([
		page.waitForResponse(
			(r) =>
				r.url().includes('/intake.updateReferral') &&
				r.request().method() === 'POST' &&
				r.status() === 200
		),
		page.getByRole('button', { name: 'Save referral', exact: true }).click()
	]);
	await expect(page.getByText('Referral saved.', { exact: true })).toBeVisible();
	await page.reload();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Unlock', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await page.getByRole('button', { name: new RegExp(name) }).click();
	await expect(need).toHaveValue('required');
	await page.getByRole('button', { name: 'Refresh placement facts', exact: true }).click();
	await expect(guidance).toContainText('Human review is required.');
	await expect(page.getByLabel('Admission home', { exact: true })).toHaveValue('');
	expect(
		(await new AxeBuilder({ page }).include('section[aria-label="Referral details"]').analyze())
			.violations
	).toEqual([]);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
