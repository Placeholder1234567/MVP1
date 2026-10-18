import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

// Controlled medication count book: a supervisor marks a medication as
// controlled, records a witnessed receipt and a blind count, the witness
// countersigns on their own device, and a count that doesn't match alerts.
// Extra signed-in devices are closed after each test so they stop syncing.
const contexts: BrowserContext[] = [];
test.afterEach(async () => {
	await Promise.all(contexts.splice(0).map((c) => c.close()));
});

async function signIn(browser: Browser, email: string, viewport: Page['viewportSize']) {
	const context = await browser.newContext(viewport() ? { viewport: viewport()! } : {});
	contexts.push(context);
	const page = await context.newPage();
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill(email);
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Oak House' });
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	return page;
}
async function go(page: Page, phone: boolean, text: string, option: RegExp) {
	if (phone) await page.getByRole('button', { name: 'Search', exact: true }).click();
	else await page.keyboard.press('Control+k');
	await page.getByRole('combobox', { name: /^Search people/ }).fill(text);
	await page.getByRole('option', { name: option }).first().click();
}
const synced = (page: Page) =>
	expect(page.getByTestId('sync-status')).toHaveText('All changes synced');

test('a witnessed count book: receipt, blind count, countersign and a mismatch', async ({
	browser,
	page: first
}, info) => {
	test.setTimeout(240000);
	const phone = info.project.name === 'phone';
	const viewport = () => first.viewportSize();
	const name = `Synthetic controlled ${info.project.name} ${Date.now()}`;

	const sam = await signIn(browser, 'supervisor@guad.test', viewport);
	await go(sam, phone, 'reports', /^Reports/);
	await sam.getByRole('link', { name: /^Manage medication definitions/ }).click();
	await sam
		.getByRole('combobox', { name: 'Medication person', exact: true })
		.selectOption({ label: 'Marcus Demo' });
	const form = sam.getByRole('form', { name: 'Medication definition editor' });
	await form.getByLabel('Medication and strength', { exact: true }).fill(name);
	await form.getByRole('combobox', { name: 'When', exact: true }).selectOption('prn');
	await form.getByLabel('As-needed instructions', { exact: true }).fill('Synthetic instructions.');
	await form.getByRole('checkbox', { name: /Keep a count book/ }).check();
	await form.getByRole('combobox', { name: 'DEA schedule', exact: true }).selectOption('II');
	await form.getByRole('button', { name: 'Add medication', exact: true }).click();
	await expect(sam.getByText(/^Medication definition saved/)).toBeVisible();

	await go(sam, phone, 'controlled', /^Controlled meds/);
	const card = sam.getByRole('article', { name: `${name} for Marcus Demo` });
	await expect(card).toBeVisible({ timeout: 30000 });
	await expect(card.getByText('Not counted yet', { exact: false })).toBeVisible();

	await card.getByRole('button', { name: 'Received from pharmacy', exact: true }).click();
	await card.getByLabel('How many were received?', { exact: true }).fill('30');
	await card.getByRole('button', { name: 'Save to count book', exact: true }).click();
	await expect(card.getByRole('alert')).toHaveText('Choose who witnessed this.');
	await card
		.getByRole('combobox', { name: 'Witness', exact: true })
		.selectOption({ label: 'Cara Giver' });
	await card.getByRole('button', { name: 'Save to count book', exact: true }).click();
	await expect(sam.getByText(/^Saved\. Your witness confirms it/)).toBeVisible();
	await expect(card.getByText('On hand: 30', { exact: true })).toBeVisible();

	await card.getByRole('button', { name: 'Count', exact: true }).click();
	await expect(card.getByText('On hand: hidden while you count')).toBeVisible();
	const axe = await new AxeBuilder({ page: sam }).include('main').analyze();
	expect(axe.violations).toEqual([]);
	await card.getByLabel('How many are on hand?', { exact: true }).fill('30');
	await card
		.getByRole('combobox', { name: 'Witness', exact: true })
		.selectOption({ label: 'Cara Giver' });
	await card.getByRole('button', { name: 'Save to count book', exact: true }).click();
	await expect(sam.getByText(/^Saved\. Your witness confirms it/)).toBeVisible();
	await synced(sam);

	const cara = await signIn(browser, 'cara@guad.test', viewport);
	const todo = cara.getByRole('link', {
		name: /Controlled medications.*waiting for your countersignature/
	});
	await expect(todo).toBeVisible({ timeout: 30000 });
	await todo.click();
	const toSign = cara.getByRole('region', { name: 'Waiting for your countersignature' });
	const rows = toSign.locator('.row', { hasText: name });
	await expect(rows).toHaveCount(2);
	for (let i = 0; i < 2; i++) {
		await rows.first().getByRole('button', { name: 'Countersign', exact: true }).click();
		await expect(cara.getByText('Countersigned. Thank you.')).toBeVisible();
		await expect(rows).toHaveCount(1 - i, { timeout: 30000 });
	}

	await card.getByRole('button', { name: 'Count', exact: true }).click();
	await card.getByLabel('How many are on hand?', { exact: true }).fill('29');
	await card
		.getByRole('combobox', { name: 'Witness', exact: true })
		.selectOption({ label: 'Cara Giver' });
	await card.getByRole('button', { name: 'Save to count book', exact: true }).click();
	await expect(sam.getByText(/^Counted 29, but 30 should be on hand/)).toBeVisible();
	await expect(sam.getByRole('link', { name: 'Report an incident', exact: true })).toBeVisible();
	await card.getByText(/^Count book \(\d+\)$/).click();
	await expect(card.getByText(/witnessed by Cara Giver/).first()).toBeVisible({ timeout: 30000 });
	await sam.screenshot({ path: info.outputPath('controlled.png'), fullPage: true });
	await synced(sam);

	await go(sam, phone, 'overview', /^Overview/);
	await expect(
		sam.locator('.attention-row', { hasText: `${name} count doesn’t match` })
	).toBeVisible({ timeout: 30000 });
});
