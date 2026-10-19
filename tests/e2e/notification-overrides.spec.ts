import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
test('an admin can save agency notification rules without disabling safety alerts', async ({
	page
}, info) => {
	test.setTimeout(180000);
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
	// Keep the in-memory unlock key during navigation; a full load correctly locks again.
	if (info.project.name === 'phone')
		await page.getByRole('button', { name: 'Search', exact: true }).click();
	else await page.keyboard.press('Control+k');
	await page.getByRole('combobox', { name: /^Search people/ }).fill('setup');
	await page
		.getByRole('option', { name: /^Setup/ })
		.first()
		.click();
	const form = page.getByRole('form', { name: 'Agency notification rules' });
	await expect(form).toBeVisible();
	expect(
		(
			await new AxeBuilder({ page })
				.include('form[aria-labelledby="notification-rules-heading"]')
				.analyze()
		).violations
	).toEqual([]);
	await expect(form.getByRole('checkbox', { name: 'Health alerts', exact: true })).toHaveCount(0);
	await expect(form.getByRole('checkbox', { name: 'Coverage offers', exact: true })).toHaveCount(0);
	const required = form.getByRole('checkbox', { name: 'Require daily summary email', exact: true });
	const initial = await required.isChecked();
	try {
		await required.setChecked(!initial);
		await form.getByRole('button', { name: 'Save notification rules', exact: true }).click();
		await expect(form.getByRole('status')).toHaveText('Notification rules saved.');
		await page.reload();
		await page.getByLabel('Device PIN', { exact: true }).fill('654321');
		await page.getByRole('button', { name: 'Unlock', exact: true }).click();
		await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
		await expect(required).toBeChecked({ checked: !initial });
	} finally {
		await required.setChecked(initial);
		await form.getByRole('button', { name: 'Save notification rules', exact: true }).click();
		await expect(form.getByRole('status')).toHaveText('Notification rules saved.');
	}
});
