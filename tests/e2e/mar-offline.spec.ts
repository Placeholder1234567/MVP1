import { test, expect, type Page } from '@playwright/test';

// Offline eMAR (offline-sync.md §5, milestone "Medication administration"):
// a caregiver gives an as-needed dose with no connection, it shows at once,
// reaches the server on reconnect, and the supervisor sees it through sync.
test.use({ timezoneId: 'UTC' });
const PIN = '654321';

test('a dose recorded offline syncs on reconnect and reaches the supervisor', async ({
	page,
	context,
	browser
}, info) => {
	test.setTimeout(240000);
	const reason = `Synthetic offline headache (${info.project.name} ${Date.now()})`;
	await signIn(page, 'lena@guad.test');
	await openMedications(page, 'Theo Demo');

	await context.setOffline(true);
	const prn = page.locator('article.dose').filter({ hasText: 'Demo PRN' });
	await prn.getByRole('button', { name: 'Give as needed', exact: true }).click();
	const sheet = prn.getByRole('form', { name: 'Record dose' });
	await sheet.getByLabel('Why is it needed?', { exact: true }).fill(reason);
	await sheet
		.getByRole('checkbox', { name: 'I, Lena Park, confirm this dose record is accurate.' })
		.check();
	await sheet.getByRole('button', { name: 'Sign and record given', exact: true }).click();
	// Shown at once from the device's own database, before any connection.
	await expect(prn.getByText(`by Lena Park for: ${reason}`)).toBeVisible();
	await expect(page.getByTestId('sync-status')).not.toHaveText('All changes synced');

	await context.setOffline(false);
	await synced(page);

	// A supervisor on another device sees the dose: it reached the server.
	const office = await (await browser.newContext({ timezoneId: 'UTC' })).newPage();
	await signIn(office, 'supervisor@guad.test', 'Maple House');
	await openMedications(office, 'Theo Demo', true);
	await expect(
		office.locator('article.dose').filter({ hasText: 'Demo PRN' }).getByText(reason)
	).toBeVisible();
	await office.context().close();
});

async function signIn(page: Page, email: string, home?: string) {
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill(email);
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill(PIN);
	await page.getByLabel('Confirm PIN', { exact: true }).fill(PIN);
	const open = page.getByRole('button', { name: 'Save PIN and open', exact: true });
	await open.click();
	await expect(open).toBeHidden();
	if (home) await page.getByLabel('Current home', { exact: true }).selectOption({ label: home });
	await synced(page);
}

async function synced(page: Page) {
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced', {
		timeout: 60000
	});
}

async function openMedications(page: Page, name: string, supervisor = false) {
	// In-app links keep the workspace unlocked; a reload would ask for the PIN.
	if (supervisor) {
		await page.getByRole('link', { name: 'Overview', exact: true }).first().click();
		await page.getByRole('link', { name: 'Care records', exact: true }).first().click();
	} else await page.getByRole('link', { name: 'Today', exact: true }).first().click();
	await page.getByRole('link', { name: new RegExp(name) }).click();
	await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
	await page.getByRole('link', { name: /^Medications/ }).click();
}
