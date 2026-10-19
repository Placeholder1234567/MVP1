import { test, expect, type Browser, type Page } from '@playwright/test';

// A draft changed on another device (offline-sync.md §5, frontend-spec-2.md
// §8.3): the open note says so, and the text it showed can be put back. Dev
// Okafor's notes about Theo Demo are used by no other test.
const PIN = '654321';

async function device(browser: Browser, viewport: Page['viewportSize']) {
	const context = await browser.newContext(viewport() ? { viewport: viewport()! } : {});
	const page = await context.newPage();
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('dev@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill(PIN);
	await page.getByLabel('Confirm PIN', { exact: true }).fill(PIN);
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Maple House' });
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	await page.getByRole('link', { name: /Theo Demo/ }).click();
	await page.getByRole('link', { name: /^Shift note/ }).click();
	return { context, page };
}

async function save(page: Page, text: string) {
	await page.getByLabel('Activities', { exact: true }).fill(text);
	await page.getByRole('button', { name: 'Save draft', exact: true }).click();
	await expect(page.getByText('Draft saved on this device.', { exact: true })).toBeVisible();
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
}

test('a draft changed on another device can be put back', async ({ browser, page }, info) => {
	test.skip(info.project.name !== 'desktop', 'One run is enough for the conflict notice.');
	test.setTimeout(180000);
	const viewport = () => page.viewportSize();
	const first = await device(browser, viewport);
	const second = await device(browser, viewport);
	try {
		const mine = `Synthetic first device ${Date.now()}`;
		await save(first.page, mine);
		const activities = second.page.getByLabel('Activities', { exact: true });
		await expect(activities).toHaveValue(mine, { timeout: 30000 });
		const theirs = `Synthetic second device ${Date.now()}`;
		await save(second.page, theirs);

		const notice = first.page.getByTestId('note-conflict');
		await expect(notice).toHaveText(/This note was updated on another device/, {
			timeout: 30000
		});
		await expect(first.page.getByLabel('Activities', { exact: true })).toHaveValue(theirs);
		await notice.getByRole('button', { name: 'Restore my version', exact: true }).click();
		await expect(first.page.getByLabel('Activities', { exact: true })).toHaveValue(mine);
		await first.page.getByRole('button', { name: 'Save draft', exact: true }).click();
		await expect(first.page.getByTestId('note-conflict')).toHaveCount(0);
		await expect(activities).toHaveValue(mine, { timeout: 30000 });
	} finally {
		await first.context.close();
		await second.context.close();
	}
});
