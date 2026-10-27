import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';

async function open(page: Page) {
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('supervisor@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Oak House' });
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	await page.getByRole('link', { name: 'Overview', exact: true }).first().click();
}
const pattern = /\/api\/trpc\/lomi\.summarize(?:\?|$)/;
const panel = (page: Page) => page.getByRole('region', { name: "Lomi's summary", exact: true });
const boundary = (page: Page) =>
	page.evaluate(
		() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
	);

// Each gate holds an actual server-produced summary, never fabricated content.
function gate() {
	let release!: () => void, received!: () => void, finished!: () => void;
	return {
		wait: new Promise<void>((r) => (release = r)),
		held: new Promise<void>((r) => (received = r)),
		done: new Promise<void>((r) => (finished = r)),
		release: () => release(),
		received: () => received(),
		finished: () => finished()
	};
}
test('daily summaries stay with the home that requested them', async ({ page }) => {
	await open(page);
	const first = gate(),
		second = gate();
	let requests = 0;
	await page.route(pattern, async (route) => {
		const held = ++requests === 1 ? first : second;
		const response = await route.fetch();
		expect(response.ok()).toBe(true);
		held.received();
		await held.wait;
		await route.fulfill({ response }).catch(() => {});
		held.finished();
	});
	try {
		await panel(page).getByRole('button', { name: 'Summarize today', exact: true }).click();
		await first.held;
		await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Maple House' });
		await panel(page).getByRole('button', { name: 'Summarize today', exact: true }).click();
		await second.held;
		first.release();
		await first.done;
		await boundary(page);
		await expect(page.getByTestId('lomi-summary-text')).toHaveCount(0);
		await expect(
			panel(page).getByRole('button', { name: 'Summarizing…', exact: true })
		).toBeDisabled();
		second.release();
		await second.done;
		await expect(page.getByTestId('lomi-summary-text')).toBeVisible();
		await expect(panel(page)).toContainText('For Maple House');
		await expect(panel(page)).not.toContainText('For Oak House');
		expect(requests).toBe(2);
	} finally {
		first.release();
		second.release();
		await page.unroute(pattern);
	}
});

test('privacy removes a loaded daily summary and rejects a held refresh until explicit recovery', async ({
	page,
	context
}, info) => {
	await open(page);
	await panel(page).getByRole('button', { name: 'Summarize today', exact: true }).click();
	await expect(page.getByTestId('lomi-summary-text')).toBeVisible();
	const held = gate();
	let requests = 0;
	await page.route(pattern, async (route) => {
		const n = ++requests;
		const response = await route.fetch();
		expect(response.ok()).toBe(true);
		if (n === 1) {
			held.received();
			await held.wait;
		}
		await route.fulfill({ response }).catch(() => {});
		if (n === 1) held.finished();
	});
	try {
		await panel(page).getByRole('button', { name: 'Refresh summary', exact: true }).click();
		await held.held;
		if (info.project.name === 'phone')
			await page.clock.setFixedTime(new Date(Date.now() + 16 * 60 * 1000));
		else await page.getByRole('button', { name: 'Lock device', exact: true }).first().click();
		await expect(
			page.getByRole('heading', { name: 'Workspace locked', exact: true })
		).toBeVisible();
		await expect(page.getByTestId('lomi-summary-text')).toHaveCount(0);
		await page.getByLabel('Device PIN', { exact: true }).fill('654321');
		await page.getByRole('button', { name: 'Unlock workspace', exact: true }).click();
		held.release();
		await held.done;
		await boundary(page);
		await expect(page.getByTestId('lomi-summary-text')).toHaveCount(0);
		expect(requests).toBe(1);
		await panel(page).getByRole('button', { name: 'Summarize today', exact: true }).click();
		await expect(page.getByTestId('lomi-summary-text')).toBeVisible();
		expect(requests).toBe(2);
		const text = await page.getByTestId('lomi-summary-text').textContent();
		await context.setOffline(true);
		await expect(
			panel(page).getByRole('button', { name: 'Refresh summary', exact: true })
		).toBeDisabled();
		await expect(page.getByTestId('lomi-summary-text')).toHaveText(text!);
		await context.setOffline(false);
		await boundary(page);
		expect(requests).toBe(2);
		expect(
			(await new AxeBuilder({ page }).include(`[aria-label="Lomi's summary"]`).analyze()).violations
		).toEqual([]);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		);
	} finally {
		held.release();
		await context.setOffline(false);
		await page.unroute(pattern);
	}
});

test('a daily summary response cannot return while destination navigation is held', async ({
	page
}) => {
	await open(page);
	const summary = gate(),
		navigation = gate();
	await page.route(pattern, async (route) => {
		const response = await route.fetch();
		expect(response.ok()).toBe(true);
		summary.received();
		await summary.wait;
		await route.fulfill({ response }).catch(() => {});
		summary.finished();
	});
	await page.route('**/shifts/__data.json*', async (route) => {
		navigation.received();
		await navigation.wait;
		await route.continue().catch(() => {});
	});
	let click: Promise<unknown> | undefined;
	try {
		await panel(page).getByRole('button', { name: 'Summarize today', exact: true }).click();
		await summary.held;
		click = page.getByRole('link', { name: 'Schedule', exact: true }).first().click();
		await navigation.held;
		summary.release();
		await summary.done;
		await boundary(page);
		await expect(panel(page)).toBeVisible();
		await expect(page.getByTestId('lomi-summary-text')).toHaveCount(0);
		await expect(
			panel(page).getByRole('button', { name: 'Summarize today', exact: true })
		).toBeDisabled();
		navigation.release();
		await click;
		await expect(page).toHaveURL(/\/shifts$/);
	} finally {
		summary.release();
		navigation.release();
		await page.unroute(pattern);
		await page.unroute('**/shifts/__data.json*');
	}
});
