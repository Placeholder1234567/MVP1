import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
for (const kind of ['lock', 'navigation'] as const) {
	test(`push list rejects a held real response: ${kind}`, async ({ page, context }, info) => {
		await page.goto('/login');
		await page.getByLabel('Email', { exact: true }).fill('admin@guad.test');
		await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
		await page.getByRole('button', { name: 'Sign in', exact: true }).click();
		await page.getByLabel('Device PIN', { exact: true }).fill('654321');
		await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
		await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
		await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
		await page.goto('/me/notifications');
		// Full navigation reopens the encrypted device store with its PIN.
		await page.getByLabel('Device PIN', { exact: true }).fill('654321');
		await page.getByRole('button', { name: 'Unlock', exact: true }).click();
		await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');

		const panel = page.getByRole('region', { name: 'Push devices', exact: true });
		const empty = panel.getByText('No push devices are registered for your account.', {
			exact: true
		});
		await expect(empty).toBeVisible();
		let release!: () => void, received!: () => void, finished!: () => void;
		const gate = new Promise<void>((r) => (release = r)),
			held = new Promise<void>((r) => (received = r)),
			done = new Promise<void>((r) => (finished = r));
		const pattern = /\/api\/trpc\/[^?]*notification\.pushDevices(?:[,?]|$)/;
		await page.route(pattern, async (route) => {
			const response = await route.fetch();
			expect(response.ok()).toBe(true);
			received();
			await gate;
			await route.fulfill({ response }).catch(() => {});
			finished();
		});
		let releaseNav!: () => void, navReceived!: () => void;
		const navGate = new Promise<void>((r) => (releaseNav = r)),
			navHeld = new Promise<void>((r) => (navReceived = r));
		let click: Promise<unknown> | undefined;
		try {
			await panel.getByRole('button', { name: 'Refresh push devices', exact: true }).click();
			await held;
			if (kind === 'lock') {
				if (info.project.name === 'phone')
					await page.clock.setFixedTime(new Date(Date.now() + 16 * 60 * 1000));
				else await page.getByRole('button', { name: 'Lock device', exact: true }).first().click();
				await expect(
					page.getByRole('heading', { name: 'Workspace locked', exact: true })
				).toBeVisible();
			} else {
				await page.route('**/shifts/__data.json*', async (route) => {
					navReceived();
					await navGate;
					await route.continue().catch(() => {});
				});
				await page.getByRole('button', { name: 'Search', exact: true }).click();
				await page.getByRole('combobox', { name: /^Search people/ }).fill('schedule');
				click = page
					.getByRole('option', { name: /^Schedule/ })
					.first()
					.click();
				await navHeld;
			}
			release();
			await done;
			await page.evaluate(
				() =>
					new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
			);
			await expect(empty).toHaveCount(0);
			if (kind === 'lock') {
				await page.getByLabel('Device PIN', { exact: true }).fill('654321');
				await page.getByRole('button', { name: 'Unlock workspace', exact: true }).click();
				await expect(empty).toHaveCount(0);
			} else {
				await expect(panel).toBeVisible();
				releaseNav();
				await click;
				await expect(page).toHaveURL(/\/shifts$/);
			}
		} finally {
			release();
			releaseNav();
			await page.unroute(pattern);
			await page.unroute('**/shifts/__data.json*');
		}
		if (kind === 'navigation') {
			await page.goto('/me/notifications');
			await page.getByLabel('Device PIN', { exact: true }).fill('654321');
			await page.getByRole('button', { name: 'Unlock', exact: true }).click();
		}
		await expect(
			panel.getByRole('button', { name: 'Refresh push devices', exact: true })
		).toBeEnabled();
		await panel.getByRole('button', { name: 'Refresh push devices', exact: true }).click();
		await expect(empty).toBeVisible();
		await context.setOffline(true);
		await expect(
			panel.getByRole('button', { name: 'Refresh push devices', exact: true })
		).toBeDisabled();
		await expect(empty).toBeVisible();
		await context.setOffline(false);
		expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		);
	});
}
