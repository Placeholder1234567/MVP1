import { test, expect, type Page } from '@playwright/test';

async function setTopHigh(page: Page, value: string) {
	await page.getByRole('link', { name: 'People', exact: true }).first().click();
	await page.getByRole('button', { name: 'Edit Marcus Demo', exact: true }).click();
	const box = page.getByLabel('Blood pressure, top, high (mmHg)', { exact: true });
	await expect(box).toBeVisible();
	await box.fill(value);
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Edit details' })).toBeHidden();
}

test('a supervisor sets a person’s own blood pressure limit and the vitals form uses it', async ({
	page
}, info) => {
	test.skip(info.project.name !== 'desktop', 'Shared synthetic person; one run is enough.');
	test.setTimeout(180000);
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('supervisor@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	const confirm = page.getByLabel('Confirm PIN', { exact: true });
	if (await confirm.isVisible()) await confirm.fill('654321');
	await page.getByRole('button', { name: /^(Save PIN and open|Unlock)$/ }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Oak House' });
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');

	await setTopHigh(page, '120');
	try {
		await page.getByRole('link', { name: 'Care records', exact: true }).first().click();
		await page.getByRole('link', { name: /Marcus Demo/ }).click();
		await page.getByRole('link', { name: /^Health Vitals/ }).click();
		const top = page.getByLabel('Blood pressure, top', { exact: true });
		await top.fill('125');
		await top.blur();
		// 125 is normal by default; Marcus's own limit is 120, synced to the device.
		await expect(page.getByText('Blood pressure (top) is outside the normal range.')).toBeVisible();
	} finally {
		// Leaving the half-filled vitals form asks for confirmation.
		page.on('dialog', (dialog) => dialog.accept());
		await setTopHigh(page, '');
	}
});
