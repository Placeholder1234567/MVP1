import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

test.use({ actionTimeout: 30000 });

for (const change of ['displayed-lock', 'list-lock', 'create-lock', 'create-navigation'] as const) {
	test(`API key responses stay in the private view: ${change}`, async ({ page, context }, info) => {
		await page.goto('/login');
		await page.getByLabel('Email', { exact: true }).fill('admin@guad.test');
		await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
		await page.getByRole('button', { name: 'Sign in', exact: true }).click();
		await page.getByLabel('Device PIN', { exact: true }).fill('654321');
		await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
		await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
		await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
		const openKeys = async () => {
			await page.getByRole('button', { name: 'Search', exact: true }).click();
			await page.getByRole('combobox', { name: /^Search people/ }).fill('API keys');
			await page
				.getByRole('option', { name: /^API keys/ })
				.first()
				.click();
			await expect(page.getByRole('heading', { name: 'API keys', exact: true })).toBeVisible();
			await expect(page.getByRole('button', { name: 'Refresh keys', exact: true })).toBeEnabled();
		};
		await openKeys();
		const keyName = `Synthetic response ${info.project.name} ${change}`;
		const create = async () => {
			await page.getByRole('button', { name: 'New key', exact: true }).click();
			await page.getByLabel('Name', { exact: true }).fill(keyName);
			await page.getByRole('button', { name: 'Create key', exact: true }).click();
		};
		const lock = async () => {
			if (info.project.name === 'phone')
				await page.clock.setFixedTime(new Date(Date.now() + 16 * 60 * 1000));
			else await page.getByRole('button', { name: 'Lock device', exact: true }).first().click();
			await expect(
				page.getByRole('heading', { name: 'Workspace locked', exact: true })
			).toBeVisible();
		};
		const unlock = async () => {
			await page.getByLabel('Device PIN', { exact: true }).fill('654321');
			await page.getByRole('button', { name: 'Unlock workspace', exact: true }).click();
			await expect(
				page.getByRole('heading', { name: 'Workspace locked', exact: true })
			).toBeHidden();
		};
		if (change === 'list-lock') {
			await create();
			await expect(page.locator('code.secret')).toBeVisible();
			await page.getByRole('button', { name: 'Done', exact: true }).click();
			await expect(
				page.getByRole('button', { name: `Revoke ${keyName}`, exact: true })
			).toBeVisible();
		}
		if (change === 'displayed-lock') {
			await create();
			await expect(page.locator('code.secret')).toBeVisible();
			await expect(page.getByRole('button', { name: 'Refresh keys', exact: true })).toBeEnabled();
			await lock();
			// Hidden by the shield is insufficient: plaintext must leave the mounted page.
			await expect(page.locator('code.secret')).toHaveCount(0);
			await unlock();
			await expect(page.locator('code.secret')).toHaveCount(0);
		} else {
			const method = change === 'list-lock' ? 'list' : 'create';
			const pattern = new RegExp('/api/trpc/[^?]*apiKey\\.' + method + '(?:[,?]|$)');
			let release!: () => void;
			let received!: () => void;
			let finished!: () => void;
			const gate = new Promise<void>((r) => (release = r));
			const held = new Promise<void>((r) => (received = r));
			const done = new Promise<void>((r) => (finished = r));
			const settled = new Promise<void>((resolve) => {
				const complete = (request: import('@playwright/test').Request) => {
					if (pattern.test(request.url())) resolve();
				};
				page.on('requestfinished', complete);
				page.on('requestfailed', complete);
			});
			await page.route(pattern, async (route) => {
				try {
					const response = await route.fetch();
					expect(response.ok()).toBe(true);
					received();
					await gate;
					await route.fulfill({ response }).catch(() => {});
				} finally {
					finished();
				}
			});
			let releaseNavigation: (() => void) | undefined;
			let clickNavigation: Promise<void> | undefined;
			try {
				if (change === 'list-lock')
					await page.getByRole('button', { name: 'Refresh keys', exact: true }).click();
				else await create();
				await held;
				if (change === 'create-navigation') {
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
				} else await lock();
				release();
				await done;
				await settled;
				await page.evaluate(
					() =>
						new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
				);
				await expect(page.locator('code.secret')).toHaveCount(0);
				await expect(page.getByRole('button', { name: /^Revoke / })).toHaveCount(0);
				if (clickNavigation) {
					releaseNavigation?.();
					await clickNavigation;
					await expect(page).toHaveURL(/\/shifts$/);
				} else {
					await unlock();
					await expect(page.getByRole('button', { name: /^Revoke / })).toHaveCount(0);
				}
				await expect(page.locator('code.secret')).toHaveCount(0);
			} finally {
				releaseNavigation?.();
				release();
				await page.unroute(pattern);
			}
			if (change === 'create-navigation') await openKeys();
		}
		await page.getByRole('button', { name: 'Refresh keys', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Refresh keys', exact: true })).toBeEnabled();
		{
			// A dropped creation response is not a cancelled server mutation.
			const revoke = page.getByRole('button', { name: `Revoke ${keyName}`, exact: true });
			await expect(revoke).toBeVisible();
			page.once('dialog', (dialog) => dialog.accept());
			await revoke.click();
			await expect(revoke).toHaveCount(0);
		}
		await context.setOffline(true);
		await expect(page.getByRole('button', { name: 'New key', exact: true })).toBeDisabled();
		await expect(page.getByRole('button', { name: 'Refresh keys', exact: true })).toBeDisabled();
		await context.setOffline(false);
		await expect(page.getByRole('button', { name: 'Refresh keys', exact: true })).toBeEnabled();
		expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		);
	});
}
