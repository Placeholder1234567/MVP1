import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

// Read receipts on the home board (frontend-audit.md finding 19): two people,
// two browser contexts, both signed in to Oak House.
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

test('the author sees who has read a board message, and readers lose the new badge', async ({
	browser,
	page: first
}, info) => {
	test.setTimeout(180000);
	const viewport = () => first.viewportSize();
	const text = `Synthetic ${info.project.name} handoff ${Date.now()}: back door sticks.`;

	const cara = await signIn(browser, 'cara@guad.test', viewport);
	await cara.getByRole('link', { name: /^Team messages/ }).click();
	await cara.getByLabel('Message your team', { exact: true }).fill(text);
	await cara
		.getByRole('combobox', { name: 'About (optional)', exact: true })
		.selectOption({ label: 'Rosa Demo' });
	await cara.getByRole('button', { name: 'Save message', exact: true }).click();
	const mine = cara.getByTestId('board').locator('article', { hasText: text });
	await expect(mine.getByText('Not seen yet', { exact: true })).toBeVisible();
	await expect(mine.getByRole('link', { name: 'Rosa Demo', exact: true })).toBeVisible();
	await expect(cara.getByTestId('sync-status')).toHaveText('All changes synced');

	const sam = await signIn(browser, 'supervisor@guad.test', viewport);
	const badge = sam.getByRole('link', { name: /^Team messages, [1-9]\d* new$/ });
	await expect(badge).toBeVisible();
	await badge.click();
	await expect(sam.getByTestId('board').getByText(text)).toBeVisible();
	await expect(sam.getByRole('link', { name: 'Team messages, 0 new', exact: true })).toBeVisible();
	await expect(sam.getByTestId('sync-status')).toHaveText('All changes synced');

	// Sam replies; the reply joins Cara's thread on both devices.
	const thread = sam.getByTestId('board').locator('article', { hasText: text });
	await thread.getByRole('button', { name: 'Reply', exact: true }).click();
	const answer = `Synthetic ${info.project.name} reply ${Date.now()}: maintenance booked.`;
	await thread.getByLabel('Your reply', { exact: true }).fill(answer);
	await thread.getByRole('button', { name: 'Save reply', exact: true }).click();
	await expect(thread.getByRole('list', { name: 'Replies' }).getByText(answer)).toBeVisible();
	await expect(sam.getByTestId('sync-status')).toHaveText('All changes synced');
	await expect(mine.getByRole('list', { name: 'Replies' }).getByText(answer)).toBeVisible({
		timeout: 30000
	});
	await expect(mine.getByRole('button', { name: 'Reply (1 reply)', exact: true })).toBeVisible();

	// The first message's receipts (the reply has its own).
	const receipts = mine.locator('details.seen').first();
	const seen = receipts.getByText(/^Seen by .*Sam Supervisor/);
	await expect(seen).toBeVisible({ timeout: 30000 });
	await seen.click();
	await expect(receipts.getByRole('listitem').filter({ hasText: 'Sam Supervisor' })).toBeVisible();
	const axe = await new AxeBuilder({ page: cara }).include('[data-testid="board"]').analyze();
	expect(axe.violations).toEqual([]);
	await cara.screenshot({ path: info.outputPath('read-receipts.png'), fullPage: true });

	// The message also shows on the person's page.
	await mine.getByRole('link', { name: 'Rosa Demo', exact: true }).click();
	await expect(cara.getByRole('heading', { name: 'Team messages about Rosa' })).toBeVisible();
	await expect(cara.getByText(text)).toBeVisible();
});
