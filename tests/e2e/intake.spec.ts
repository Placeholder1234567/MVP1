import { test, expect } from '@playwright/test';

// Intake referrals: on a phone the list and the open referral take turns
// (frontend-audit finding 20); on a computer they sit side by side.
test('referral list and details take turns on narrow screens', async ({ page }, info) => {
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('admin@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await page.evaluate(() => {
		const a = document.createElement('a');
		a.href = '/dashboard/intake';
		document.body.append(a);
		a.click();
		a.remove();
	});
	const list = page.getByRole('region', { name: 'Referral pipeline', exact: true });
	await expect(list).toBeVisible();
	await page.getByRole('button', { name: 'New referral', exact: true }).click();
	const contact = page.getByLabel('Contact name', { exact: true });
	await contact.fill(`Synthetic ${info.project.name} intake contact`);
	const back = page.getByRole('button', { name: '← All referrals', exact: true });
	if (info.project.name === 'phone') {
		await expect(list).toBeHidden();
		// Unsaved changes are kept unless the person confirms.
		page.once('dialog', (dialog) => dialog.dismiss());
		await back.click();
		await expect(contact).toBeVisible();
		page.once('dialog', (dialog) => dialog.accept());
		await back.click();
		await expect(list).toBeVisible();
		await expect(contact).toBeHidden();
	} else {
		await expect(list).toBeVisible();
		await expect(back).toBeHidden();
	}
});

// Notes at each stage (US-29): a note keeps the stage it was written at.
test('a supervisor adds notes as a referral moves through its stages', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop', 'One run is enough for the intake form.');
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('admin@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await page.getByRole('link', { name: 'Intake', exact: true }).first().click();

	const who = `Synthetic stage notes ${Date.now()}`;
	await page.getByRole('button', { name: 'New referral', exact: true }).click();
	await page.getByLabel('Contact name', { exact: true }).fill(who);
	await page.getByRole('button', { name: 'Create referral', exact: true }).click();

	const notes = page.getByRole('region', { name: 'Notes by stage', exact: true });
	await notes
		.getByRole('textbox', { name: /^Note at Inquiry/ })
		.fill('First call with the family.');
	await notes.getByRole('button', { name: 'Add note', exact: true }).click();
	await expect(notes.getByRole('listitem').first()).toContainText('Inquiry');

	await page.getByRole('combobox', { name: /^Stage/ }).selectOption('touring');
	await page.getByRole('button', { name: 'Save referral', exact: true }).click();
	await expect(page.getByText('Referral saved.', { exact: true })).toBeVisible();
	await notes.getByRole('textbox', { name: /^Note at Touring/ }).fill('Toured Oak House.');
	await notes.getByRole('button', { name: 'Add note', exact: true }).click();
	const items = notes.getByRole('listitem');
	await expect(items).toHaveCount(2);
	await expect(items.nth(1)).toContainText('Touring');
	await expect(items.nth(1)).toContainText('Toured Oak House.');
});
