import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

test('Talk to Lomi opens current-home charting without submitting a note', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('supervisor@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Oak House' });
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	await page.getByRole('link', { name: 'Talk to Lomi', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Who are you charting for?' })).toBeVisible();
	const picker = page.getByRole('region', { name: 'Start charting with Lomi' });
	await expect(picker.getByRole('link', { name: /Rosa Demo/ })).toBeVisible();
	await expect(picker.getByRole('link', { name: /Theo Demo/ })).toHaveCount(0);
	await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Maple House' });
	await expect(picker.getByRole('link', { name: /Rosa Demo/ })).toHaveCount(0);
	await expect(picker.getByRole('link', { name: /Theo Demo/ })).toBeVisible();
	expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await picker.getByRole('link', { name: /Theo Demo/ }).click();
	await expect(page.getByRole('region', { name: 'Lomi drafting assistant' })).toBeVisible();
	await expect(page.getByLabel('Your observations', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Prepare a draft', exact: true })).toBeDisabled();
});
