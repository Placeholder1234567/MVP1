import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

test('a synthetic admin previews notification templates without queuing or sending', async ({
	page
}, info) => {
	expect((await page.goto('/dev/notifications'))?.status()).toBe(404);
	await page.goto('/login');
	// The real dev server loads modules on demand; wait before interacting with SSR controls.
	await page.waitForLoadState('networkidle');
	await page.getByLabel('Email', { exact: true }).fill('admin@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeVisible();
	await page.goto('/dev/notifications');
	await expect(page.getByRole('heading', { name: 'Development notifications' })).toBeVisible();
	await page.getByLabel('Notification type', { exact: true }).selectOption('health_alert');
	await page.getByRole('button', { name: 'Preview notification', exact: true }).click();
	await expect(page.getByRole('status')).toHaveText(
		'Preview prepared. Nothing was queued or sent.'
	);
	await expect(page.getByRole('region', { name: 'push preview', exact: true })).toContainText(
		'Open Guad to see details.'
	);
	expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await page.screenshot({ path: info.outputPath('dev-preview.png'), fullPage: true });
});
