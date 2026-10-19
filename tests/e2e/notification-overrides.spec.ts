import { test, expect } from '@playwright/test';
test('an admin can save agency notification rules without disabling safety alerts', async ({
	page
}) => {
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
	await page.goto('/dashboard/setup');
	const form = page.getByRole('form', { name: 'Agency notification rules' });
	await expect(form).toBeVisible();
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
