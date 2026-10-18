import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';

async function search(page: Page, phone: boolean, text: string, option: RegExp) {
	if (phone) await page.getByRole('button', { name: 'Search', exact: true }).click();
	else await page.keyboard.press('Control+k');
	await page.getByRole('combobox', { name: /^Search people/ }).fill(text);
	await page.getByRole('option', { name: option }).first().click();
}

test('admins set incident reporting rules and the incident wizard follows them', async ({
	page
}, info) => {
	test.setTimeout(180000);
	const phone = info.project.name === 'phone';
	const deadline = `Within 6 hours (synthetic ${info.project.name})`;
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('admin@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Oak House' });
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');

	await search(page, phone, 'setup', /^Setup/);
	const form = page.getByRole('form', { name: 'Incident reporting rules' });
	await form.getByLabel('Family or guardian: deadline', { exact: true }).fill(deadline);
	await form
		.getByRole('group', { name: 'Nurse: for these incidents' })
		.getByLabel('Fall', { exact: true })
		.uncheck();
	const axe = await new AxeBuilder({ page })
		.include('form[aria-labelledby="incident-rules-heading"]')
		.analyze();
	expect(axe.violations).toEqual([]);
	await form.getByRole('button', { name: 'Save incident rules', exact: true }).click();
	await expect(form.getByRole('status')).toHaveText(/^Incident rules saved/);

	try {
		await search(page, phone, 'care records', /^Care records/);
		await page.getByRole('link', { name: /Rosa Demo/ }).click();
		await page.getByRole('link', { name: /^Report an incident/ }).click();
		await page
			.getByRole('group', { name: 'What kind of incident?', exact: true })
			.getByRole('button', { name: 'Fall', exact: true })
			.click();
		await page.getByLabel('What happened', { exact: true }).fill('Synthetic rules check.');
		await page.getByRole('button', { name: 'Next', exact: true }).click();
		await page.getByLabel('What you did', { exact: true }).fill('Synthetic rules check.');
		await page.getByRole('button', { name: 'Next', exact: true }).click();
		const told = page.locator('.field', { hasText: 'Who needs to be told' });
		await expect(told.getByText(deadline, { exact: true })).toBeVisible();
		// A fall no longer needs the nurse under these rules.
		await expect(told.getByText('Nurse', { exact: true })).toHaveCount(0);
		await page.screenshot({ path: info.outputPath('incident-rules.png'), fullPage: true });
	} finally {
		// Put the defaults back for other tests; leave the unfinished report.
		page.once('dialog', (dialog) => dialog.accept());
		await search(page, phone, 'setup', /^Setup/);
		await form.getByRole('button', { name: 'Restore defaults', exact: true }).click();
		await form.getByRole('button', { name: 'Save incident rules', exact: true }).click();
		await expect(form.getByRole('status')).toHaveText(/^Incident rules saved/);
	}
});
