import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

test.use({ actionTimeout: 30000 });
for (const change of ['list-lock', 'invite-lock', 'update-navigation'] as const) {
	test(`staff responses stay in the requested private view: ${change}`, async ({
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
		const openStaff = async () => {
			await page.getByRole('button', { name: 'Search', exact: true }).click();
			await page.getByRole('combobox', { name: /^Search people/ }).fill('staff');
			await page
				.getByRole('option', { name: /^Staff/ })
				.first()
				.click();
			await expect(page.getByRole('heading', { name: 'Staff', exact: true })).toBeVisible();
			await expect(page.getByRole('button', { name: 'Refresh staff', exact: true })).toBeEnabled();
		};
		await openStaff();
		const roster = page.locator('section[aria-label="Staff"]');
		await expect(roster.getByRole('button', { name: /^Edit / }).first()).toBeVisible();
		const name = `Response ${info.project.name} ${change}`;
		const email = `response-${info.project.name}-${change}@guad.test`;
		const invite = async () => {
			await page.getByRole('button', { name: 'Add staff', exact: true }).click();
			await page.getByLabel('Full name', { exact: true }).fill(name);
			await page.getByLabel('Email', { exact: true }).fill(email);
			await page.getByRole('button', { name: 'Send invitation', exact: true }).click();
		};
		if (change === 'update-navigation') {
			await invite();
			await expect(page.getByRole('button', { name: `Edit ${name}`, exact: true })).toBeVisible();
			await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
			await page.getByLabel('Medication certified', { exact: true }).check();
		}
		const method = change === 'list-lock' ? 'list' : change === 'invite-lock' ? 'invite' : 'update';
		const pattern = new RegExp('/api/trpc/[^?]*staff\\.' + method + '(?:[,?]|$)');
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
			if (change === 'list-lock')
				await page.getByRole('button', { name: 'Refresh staff', exact: true }).click();
			else if (change === 'invite-lock') await invite();
			else await page.getByRole('button', { name: 'Save', exact: true }).click();
			await held;
			if (change === 'update-navigation') {
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
			release();
			await done;
			await settled;
			await page.evaluate(
				() =>
					new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
			);
			// Check the still-mounted view, before the destination may dispose it.
			await expect(roster.getByRole('button', { name: /^Edit / })).toHaveCount(0);
			await expect(roster.locator('form')).toHaveCount(0);
			await expect(page.getByText('Saved.', { exact: true })).toHaveCount(0);
			await expect(page.getByText(/^Invitation sent to /)).toHaveCount(0);
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
				await expect(roster.getByRole('button', { name: /^Edit / })).toHaveCount(0);
			}
		} finally {
			releaseNavigation?.();
			release();
			await page.unroute(pattern);
		}
		if (change === 'update-navigation') await openStaff();
		await page.getByRole('button', { name: 'Refresh staff', exact: true }).click();
		await expect(page.getByRole('button', { name: 'Refresh staff', exact: true })).toBeEnabled();
		await expect(roster.getByRole('button', { name: /^Edit / }).first()).toBeVisible();
		if (change !== 'list-lock') {
			const row = roster.getByRole('listitem').filter({ hasText: name });
			await expect(row).toBeVisible();
			if (change === 'update-navigation') await expect(row).toContainText('med-certified');
		}
		await context.setOffline(true);
		await expect(page.getByRole('button', { name: 'Add staff', exact: true })).toBeDisabled();
		await expect(page.getByRole('button', { name: 'Refresh staff', exact: true })).toBeDisabled();
		await expect(roster.getByRole('button', { name: /^Edit / }).first()).toBeVisible();
		await context.setOffline(false);
		await expect(page.getByRole('button', { name: 'Refresh staff', exact: true })).toBeEnabled();
		expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		);
	});
}
