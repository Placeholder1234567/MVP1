import { test, expect } from '@playwright/test';

// Accounting of disclosures (HIPAA 164.528): a supervisor records what was
// shared outside care and downloads the list to give the person.
test('a supervisor records a disclosure and downloads the accounting', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop', 'One run is enough for a supervisor form.');
	test.setTimeout(180000);
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('supervisor@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();

	await page.getByRole('link', { name: 'People', exact: true }).first().click();
	await page
		.getByRole('link', { name: /Rosa Demo/ })
		.first()
		.click();
	await page.waitForURL(/\/dashboard\/people\/[0-9a-f-]{36}$/);

	const recipient = `County court (synthetic ${Date.now()})`;
	await page.getByRole('button', { name: 'Record a disclosure', exact: true }).click();
	const form = page.getByRole('form', { name: 'Record a disclosure' });
	await form.getByLabel('Shared with', { exact: true }).fill(recipient);
	await form.getByLabel('What was shared', { exact: true }).fill('Incident report');
	await form
		.getByRole('combobox', { name: /^Why/ })
		.selectOption({ label: 'Court order or subpoena' });
	await form.getByRole('button', { name: 'Save disclosure', exact: true }).click();
	await expect(page.getByText('Disclosure recorded.', { exact: true })).toBeVisible();
	const history = page.getByRole('group', { name: 'Disclosure history', exact: true });
	await expect(history.locator('.row').filter({ hasText: recipient })).toContainText(
		'Court order or subpoena'
	);

	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: 'Download accounting (CSV)', exact: true }).click()
	]);
	expect(download.suggestedFilename()).toMatch(/^guad-disclosures-\d{4}-\d{2}-\d{2}\.csv$/);
	const text = await (await download.createReadStream()).toArray();
	expect(Buffer.concat(text).toString('utf8')).toContain(recipient);
});
