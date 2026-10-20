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
	await page.getByLabel('Delivery history scope', { exact: true }).selectOption('agency');
	await page.getByLabel('Notification type', { exact: true }).selectOption('daily_summary');
	const confirmation = page.waitForEvent('dialog').then((dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Send synthetic test', exact: true }).click();
	await confirmation;
	await expect(page.getByRole('status')).toContainText('Synthetic test requested:');
	await expect(page.getByRole('status')).toContainText('Delivery is not yet confirmed.');
	await expect(
		page.getByText('Synthetic development notification', { exact: true }).first()
	).toBeVisible();
	await page.getByLabel('Notification type', { exact: true }).selectOption('health_alert');
	const queueConfirmation = page.waitForEvent('dialog').then((dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Send synthetic test', exact: true }).click();
	await queueConfirmation;
	const run = page
		.getByRole('button', { name: 'Run synthetic escalation now', exact: true })
		.first();
	await expect(run).toBeVisible();
	const fireConfirmation = page.waitForEvent('dialog').then((dialog) => dialog.accept());
	await run.click();
	await fireConfirmation;
	await expect(page.getByRole('status')).toHaveText(
		'Task handler: completed. Check delivery history for the result.'
	);
	expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
	await page.screenshot({ path: info.outputPath('dev-preview.png'), fullPage: true });
});
