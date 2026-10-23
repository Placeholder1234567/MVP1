import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

test.use({ actionTimeout: 30000 });
for (const change of ['load-lock', 'home-lock', 'home-navigation', 'child-lock'] as const) {
	test(`setup responses stay in the requested private view: ${change}`, async ({
		page,
		context
	}, info) => {
		await page.goto('/login');
		await page.getByLabel('Email', { exact: true }).fill('admin@guad.test');
		await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
		await page.getByRole('button', { name: 'Sign in', exact: true }).click();
		await page.getByLabel('Device PIN', { exact: true }).fill('654321');
		await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
		await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
		await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
		const openSetup = async () => {
			await page.getByRole('button', { name: 'Search', exact: true }).click();
			await page.getByRole('combobox', { name: /^Search people/ }).fill('setup');
			await page
				.getByRole('option', { name: /^Setup/ })
				.first()
				.click();
			await expect(page.getByRole('heading', { name: 'Setup', exact: true })).toBeVisible();
			await expect(
				page.getByRole('button', { name: 'Refresh settings', exact: true })
			).toBeEnabled();
		};
		await openSetup();
		const setup = page.locator('section[aria-label="Agency setup"]');
		await expect(setup.getByLabel('Agency name', { exact: true })).toBeVisible();
		const name = `Zz response ${info.project.name} ${change}`;
		const addHome = async () => {
			await page.getByRole('button', { name: 'Add a home', exact: true }).click();
			await setup.getByLabel('Name', { exact: true }).fill(name);
			await page.getByRole('button', { name: 'Save home', exact: true }).click();
		};
		const method =
			change === 'load-lock'
				? 'agency\\.get'
				: change === 'child-lock'
					? 'agency\\.update'
					: 'home\\.create';
		const pattern = new RegExp('/api/trpc/[^?]*' + method + '(?:[,?]|$)');
		let release!: () => void, received!: () => void, finished!: () => void;
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
			if (change === 'load-lock')
				await page.getByRole('button', { name: 'Refresh settings', exact: true }).click();
			else if (change === 'child-lock')
				await page.getByRole('button', { name: 'Save count rules', exact: true }).click();
			else await addHome();
			await held;
			if (change === 'home-navigation') {
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
			} else {
				if (info.project.name === 'phone')
					await page.clock.setFixedTime(new Date(Date.now() + 16 * 60 * 1000));
				else await page.getByRole('button', { name: 'Lock device', exact: true }).first().click();
				await expect(
					page.getByRole('heading', { name: 'Workspace locked', exact: true })
				).toBeVisible();
			}
			await expect(setup.locator('form')).toHaveCount(0);
			if (change === 'child-lock') {
				// Mount a NEW snapshot and start a new edit before the OLD child
				// completes. Its old onSaved callback must not reload this form.
				await page.getByLabel('Device PIN', { exact: true }).fill('654321');
				await page.getByRole('button', { name: 'Unlock workspace', exact: true }).click();
				await page.getByRole('button', { name: 'Refresh settings', exact: true }).click();
				await expect(
					page.getByRole('button', { name: 'Refresh settings', exact: true })
				).toBeEnabled();
				await setup.getByLabel('Agency name', { exact: true }).fill(name);
			}
			let lateReloads = 0;
			page.on('request', (request) => {
				if (/\/api\/trpc\/[^?]*agency\.get(?:[,?]|$)/.test(request.url())) lateReloads++;
			});
			release();
			await done;
			await settled;
			await page.evaluate(
				() =>
					new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
			);
			if (change === 'child-lock') {
				expect(lateReloads).toBe(0);
				await expect(setup.getByLabel('Agency name', { exact: true })).toHaveValue(name);
				await expect(
					page.getByText('Saved. Devices use these rules after their next sync.', { exact: true })
				).toHaveCount(0);
			} else {
				// Still-mounted page, including while destination data is held.
				await expect(setup.locator('form')).toHaveCount(0);
				await expect(setup.getByRole('listitem')).toHaveCount(0);
				await expect(
					page.getByText('Home saved. Geofence changes apply to future clock-ins.', { exact: true })
				).toHaveCount(0);
				if (clickNavigation) {
					releaseNavigation?.();
					await clickNavigation;
					await expect(page).toHaveURL(/\/shifts$/);
				} else {
					await page.getByLabel('Device PIN', { exact: true }).fill('654321');
					await page.getByRole('button', { name: 'Unlock workspace', exact: true }).click();
					await expect(
						page.getByRole('heading', { name: 'Workspace locked', exact: true })
					).toBeHidden();
					await expect(setup.locator('form')).toHaveCount(0);
				}
			}
		} finally {
			releaseNavigation?.();
			release();
			await page.unroute(pattern);
		}
		if (change === 'home-navigation') await openSetup();
		await page.getByRole('button', { name: 'Refresh settings', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Refresh settings', exact: true })).toBeEnabled();
		await expect(setup.getByLabel('Agency name', { exact: true })).toBeVisible();
		if (change === 'home-lock' || change === 'home-navigation') {
			// Aborting/dropping UI feedback did not cancel the committed home.
			await expect(setup.getByRole('listitem').filter({ hasText: name })).toBeVisible();
			page.once('dialog', (dialog) => dialog.accept());
			await page.getByRole('button', { name: `Archive ${name}`, exact: true }).click();
			await expect(setup.getByRole('listitem').filter({ hasText: name })).toContainText('Archived');
		}
		await context.setOffline(true);
		await expect(page.getByRole('button', { name: 'Add a home', exact: true })).toBeDisabled();
		await expect(
			page.getByRole('button', { name: 'Refresh settings', exact: true })
		).toBeDisabled();
		await expect(setup.getByLabel('Agency name', { exact: true })).toBeVisible();
		await expect(setup.getByLabel('Agency name', { exact: true })).toBeDisabled();
		await expect(page.getByRole('button', { name: 'Save count rules', exact: true })).toHaveCount(
			0
		);
		await context.setOffline(false);
		await expect(page.getByRole('button', { name: 'Refresh settings', exact: true })).toBeEnabled();
		expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		);
	});
}
