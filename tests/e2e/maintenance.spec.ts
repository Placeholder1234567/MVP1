import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

test('an admin announces maintenance and everyone gets an alert with the window', async ({
	page
}, info) => {
	test.setTimeout(180000);
	const phone = info.project.name === 'phone';
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('admin@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');

	// Setup isn't in the phone tab bar; search reaches it on any screen.
	if (phone) await page.getByRole('button', { name: 'Search', exact: true }).click();
	else await page.keyboard.press('Control+k');
	await page.getByRole('combobox', { name: /^Search people/ }).fill('setup');
	await page.getByRole('option', { name: /^Setup/ }).click();
	const form = page.getByRole('form', { name: 'Announce maintenance' });
	await expect(form).toBeVisible();

	const day = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
	await form.getByLabel('Starts', { exact: true }).fill(`${day}T22:00`);
	await form.getByLabel('Ends', { exact: true }).fill(`${day}T21:00`);
	await expect(form.getByText('Maintenance has to end after it starts.')).toBeVisible();
	await form.getByLabel('Ends', { exact: true }).fill(`${day}T23:30`);
	await form.getByLabel('Syncing will pause', { exact: true }).check();
	const preview = form.getByLabel('Announcement preview');
	await expect(preview).toContainText(/from 10:00 PM to 11:30 PM/);
	await expect(preview).toContainText('Syncing will pause.');
	const axe = await new AxeBuilder({ page }).include('form[aria-labelledby]').analyze();
	expect(axe.violations).toEqual([]);

	page.once('dialog', (dialog) => dialog.accept());
	await form.getByRole('button', { name: 'Send announcement', exact: true }).click();
	await expect(form.getByRole('status')).toHaveText(/^Sent to \d+ people\.$/);
	await expect(preview).toBeHidden();

	await page.getByRole('link', { name: /^Alerts, \d+ unread$/ }).click();
	await expect(
		page
			.getByText(/Guad will undergo scheduled maintenance on .* from 10:00 PM to 11:30 PM/)
			.first()
	).toBeVisible();
	await page.screenshot({ path: info.outputPath('maintenance.png'), fullPage: true });
});
