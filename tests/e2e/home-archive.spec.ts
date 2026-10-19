import { test, expect } from '@playwright/test';

test('an admin archives a closed home and it moves under Archived in the switcher', async ({
	page
}, info) => {
	test.setTimeout(180000);
	const phone = info.project.name === 'phone';
	// Sorts after the seeded homes, and ends archived, so other tests' default
	// home (the first one in use) doesn't change.
	const name = `Zz closed ${info.project.name} ${Date.now() % 100000}`;
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('admin@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	const confirm = page.getByLabel('Confirm PIN', { exact: true });
	if (await confirm.isVisible()) await confirm.fill('654321');
	await page.getByRole('button', { name: /^(Save PIN and open|Unlock)$/ }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');

	if (phone) await page.getByRole('button', { name: 'Search', exact: true }).click();
	else await page.keyboard.press('Control+k');
	await page.getByRole('combobox', { name: /^Search people/ }).fill('setup');
	await page.getByRole('option', { name: /^Setup/ }).click();

	await page.getByRole('button', { name: 'Add a home', exact: true }).click();
	await page.getByLabel('Name', { exact: true }).fill(name);
	await page.getByRole('button', { name: 'Save home', exact: true }).click();
	const homeRow = page.getByRole('listitem').filter({ hasText: name });
	await expect(homeRow).toBeVisible();

	page.once('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: `Archive ${name}`, exact: true }).click();
	await expect(page.getByText(`${name} archived.`)).toBeVisible();
	await expect(homeRow.getByText('Archived', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: `Edit ${name}`, exact: true })).toBeHidden();

	// Synced to the device: listed under Archived, not with homes in use.
	const switcher = page.getByLabel('Current home', { exact: true });
	await expect(
		switcher.locator('optgroup[label="Archived"] option', { hasText: name })
	).toHaveCount(1);

	await page.getByRole('button', { name: `Restore ${name}`, exact: true }).click();
	await expect(page.getByText(`${name} restored.`)).toBeVisible();
	await expect(
		switcher.locator('optgroup[label="Archived"] option', { hasText: name })
	).toHaveCount(0);

	page.once('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: `Archive ${name}`, exact: true }).click();
	await expect(page.getByText(`${name} archived.`)).toBeVisible();
});
