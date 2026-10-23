import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

test.use({ actionTimeout: 30000 });
for (const change of [
	'select-race',
	'context-home',
	'loaded-lock',
	'lock',
	'navigation'
] as const) {
	test(`analytics responses belong to the current home and private view: ${change}`, async ({
		page,
		context
	}, info) => {
		await page.goto('/login');
		await page.getByLabel('Email', { exact: true }).fill('supervisor@guad.test');
		await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
		await page.getByRole('button', { name: 'Sign in', exact: true }).click();
		await page.getByLabel('Device PIN', { exact: true }).fill('654321');
		await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
		await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
		await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
		await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Oak House' });
		await page.getByRole('button', { name: 'Search', exact: true }).click();
		await page.getByRole('combobox', { name: /^Search people/ }).fill('analytics');
		await page
			.getByRole('option', { name: /^Analytics/ })
			.first()
			.click();
		const view = page.locator('section[aria-label="Analytics"]');
		const refresh = view.getByRole('button', { name: 'Refresh analytics', exact: true });
		const home = view.getByLabel('Home', { exact: true });
		const charts = view.getByRole('article', { name: 'Goal progress', exact: true });
		await expect(charts).toBeVisible();
		await expect(refresh).toBeEnabled();
		await context.setOffline(true);
		await expect(refresh).toBeDisabled();
		await expect(charts).toBeVisible();
		await context.setOffline(false);
		await expect(refresh).toBeEnabled();
		expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		);

		if (change === 'loaded-lock') {
			if (info.project.name === 'phone')
				await page.clock.setFixedTime(new Date(Date.now() + 16 * 60 * 1000));
			else await page.getByRole('button', { name: 'Lock device', exact: true }).first().click();
			await expect(
				page.getByRole('heading', { name: 'Workspace locked', exact: true })
			).toBeVisible();
			expect(
				await page
					.locator('section[aria-label="Analytics"] article[aria-label="Goal progress"]')
					.count()
			).toBe(0);
			await page.getByLabel('Device PIN', { exact: true }).fill('654321');
			await page.getByRole('button', { name: 'Unlock workspace', exact: true }).click();
			await expect(
				page.getByRole('heading', { name: 'Workspace locked', exact: true })
			).toBeHidden();
			await expect(charts).toHaveCount(0);
			await refresh.click();
			await expect(charts).toBeVisible();
			return;
		}

		const pattern = /\/api\/trpc\/[^?]*analytics\.weekly(?:[,?]|$)/;
		let release!: () => void, received!: () => void, finished!: () => void;
		let releaseSecond!: () => void, receivedSecond!: () => void, finishedSecond!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const held = new Promise<void>((r) => (received = r));
		const done = new Promise<void>((r) => (finished = r));
		const secondGate = new Promise<void>((r) => (releaseSecond = r));
		const secondHeld = new Promise<void>((r) => (receivedSecond = r));
		const secondDone = new Promise<void>((r) => (finishedSecond = r));
		let requests = 0;
		let firstRequest: import('@playwright/test').Request;
		const settled = new Promise<void>((resolve) => {
			const complete = (request: import('@playwright/test').Request) => {
				if (request === firstRequest) resolve();
			};
			page.on('requestfinished', complete);
			page.on('requestfailed', complete);
		});
		await page.route(pattern, async (route) => {
			const first = ++requests === 1;
			if (first) firstRequest = route.request();
			try {
				const response = await route.fetch();
				expect(response.ok()).toBe(true);
				if (first) {
					received();
					await gate;
				} else {
					receivedSecond();
					await secondGate;
				}
				await route.fulfill({ response }).catch(() => {});
			} finally {
				if (first) finished();
				else finishedSecond();
			}
		});
		let releaseNavigation: (() => void) | undefined;
		let clickNavigation: Promise<void> | undefined;
		try {
			if (change === 'select-race') await home.selectOption({ label: 'Oak House' });
			else await refresh.click();
			await held;
			await expect(charts).toHaveCount(0);
			if (change === 'select-race') {
				await home.selectOption({ label: 'Maple House' });
				await secondHeld;
			} else if (change === 'context-home') {
				await page
					.getByLabel('Current home', { exact: true })
					.selectOption({ label: 'Maple House' });
				await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Oak House' });
			} else if (change === 'lock') {
				if (info.project.name === 'phone')
					await page.clock.setFixedTime(new Date(Date.now() + 16 * 60 * 1000));
				else await page.getByRole('button', { name: 'Lock device', exact: true }).first().click();
				await expect(
					page.getByRole('heading', { name: 'Workspace locked', exact: true })
				).toBeVisible();
			} else {
				let destinationRequested!: () => void;
				const destinationHeld = new Promise<void>((r) => (destinationRequested = r));
				const destinationGate = new Promise<void>((r) => (releaseNavigation = r));
				await page.route('**/shifts/__data.json*', async (route) => {
					destinationRequested();
					await destinationGate;
					await route.continue().catch(() => {});
				});
				await page.getByRole('button', { name: 'Search', exact: true }).click();
				await page.getByRole('combobox', { name: /^Search people/ }).fill('schedule');
				clickNavigation = page
					.getByRole('option', { name: /^Schedule/ })
					.first()
					.click();
				await destinationHeld;
			}
			release();
			await done;
			await settled;
			await page.evaluate(
				() =>
					new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
			);
			// DOM absence matters even when the privacy shield hides its mounted children.
			expect(
				await page
					.locator('section[aria-label="Analytics"] article[aria-label="Goal progress"]')
					.count()
			).toBe(0);
			if (change === 'select-race') {
				await expect(refresh).toBeDisabled();
				await expect(view).toContainText('Maple House · last 4 weeks');
				releaseSecond();
				await secondDone;
				await expect(charts).toBeVisible();
				await expect(refresh).toBeEnabled();
				await expect(view).toContainText('Maple House · last 4 weeks');
			} else if (change === 'navigation') {
				releaseNavigation?.();
				await clickNavigation;
				await expect(page).toHaveURL(/\/shifts$/);
				await expect(charts).toHaveCount(0);
			} else {
				if (change === 'lock') {
					await page.getByLabel('Device PIN', { exact: true }).fill('654321');
					await page.getByRole('button', { name: 'Unlock workspace', exact: true }).click();
					await expect(
						page.getByRole('heading', { name: 'Workspace locked', exact: true })
					).toBeHidden();
				}
				await expect(charts).toHaveCount(0);
				await page.unroute(pattern);
				await refresh.click();
				await expect(charts).toBeVisible();
			}
		} finally {
			release();
			releaseSecond();
			releaseNavigation?.();
			await page.unroute(pattern);
		}
	});
}
