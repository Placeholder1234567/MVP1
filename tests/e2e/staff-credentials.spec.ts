import { test, expect } from '@playwright/test';

// Staff training and certifications: an admin records one that expires soon
// and sees it flagged on Staff.
test('an admin records a certification and sees it expiring', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop', 'One run is enough for an admin form.');
	test.setTimeout(180000);
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('admin@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();

	// In-app navigation: a reload would lock the workspace again.
	await page.getByRole('link', { name: 'Staff', exact: true }).first().click();
	await expect(page.getByRole('heading', { name: 'Staff', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Edit Dev Okafor', exact: true }).click();
	const name = `Synthetic training ${Date.now()}`;
	const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
	await page.getByRole('button', { name: 'Add training or certification', exact: true }).click();
	const form = page.getByRole('form', { name: 'Training or certification' });
	await form.getByRole('combobox', { name: 'Type' }).selectOption({ label: 'Other training' });
	await form.getByLabel('Name', { exact: true }).fill(name);
	await form.getByLabel(/^Valid through/).fill(soon);
	await form.getByRole('button', { name: 'Save', exact: true }).click();
	const mine = page.getByRole('region', { name: 'Training and certifications', exact: true });
	await expect(mine.getByRole('listitem').filter({ hasText: name })).toContainText('Expiring soon');

	// Closing the form shows the agency's expiring list, which includes it.
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	const overview = page.getByRole('region', {
		name: 'Expiring training and certifications',
		exact: true
	});
	await expect(overview.getByRole('listitem').filter({ hasText: name })).toContainText(
		'Dev Okafor'
	);
});
