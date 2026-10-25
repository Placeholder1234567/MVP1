import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

test.use({ actionTimeout: 30000 });
for (const kind of ['save-lock', 'save-navigation', 'cancel-navigation'] as const) {
	test(`delivery preferences reject late feedback and retain choices: ${kind}`, async ({
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
		await page.goto('/me/notifications');
		// Full navigation reopens the encrypted device store with its PIN.
		await page.getByLabel('Device PIN', { exact: true }).fill('654321');
		await page.getByRole('button', { name: 'Unlock', exact: true }).click();
		await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');

		const form = page.getByRole('form', { name: 'Delivery preferences', exact: true });
		const choice = () => form.getByRole('checkbox', { name: 'Daily summaries email', exact: true });
		await expect(choice()).toBeEnabled();
		const initial = await choice().isChecked();
		await choice().setChecked(!initial);
		const success = form.getByText(
			'Delivery preferences saved. Required safety channels remain enabled.',
			{ exact: true }
		);
		if (kind === 'cancel-navigation') {
			page.once('dialog', (dialog) => dialog.dismiss());
			await form.getByRole('link', { name: '← Your alerts', exact: true }).click();
			await expect(page).toHaveURL(/\/me\/notifications$/);
			expect(await choice().isChecked()).toBe(!initial);
			await context.setOffline(true);
			await expect(form.getByRole('button', { name: /^Save preferences/ }).first()).toBeDisabled();
			expect(await choice().isChecked()).toBe(!initial);
			await context.setOffline(false);
			await form.getByRole('button', { name: 'Discard changes', exact: true }).click();
		} else {
			const pattern = /\/api\/trpc\/[^?]*notification\.updatePreferences(?:[,?]|$)/;
			let release!: () => void, received!: () => void, finished!: () => void;
			const gate = new Promise<void>((r) => (release = r)),
				held = new Promise<void>((r) => (received = r)),
				done = new Promise<void>((r) => (finished = r));
			await page.route(pattern, async (route) => {
				const response = await route.fetch();
				expect(response.ok()).toBe(true);
				received();
				await gate;
				await route.fulfill({ response }).catch(() => {});
				finished();
			});
			let releaseNavigation!: () => void, navigationReceived!: () => void;
			const navigationGate = new Promise<void>((r) => (releaseNavigation = r)),
				navigationHeld = new Promise<void>((r) => (navigationReceived = r));
			const destination = /\/shifts\/__data\.json(?:\?|$)/;
			let navigation: Promise<unknown> | undefined;
			try {
				await form
					.getByRole('button', { name: /^Save preferences/ })
					.first()
					.click();
				await held;
				if (kind === 'save-lock') {
					if (info.project.name === 'phone')
						await page.clock.setFixedTime(new Date(Date.now() + 16 * 60 * 1000));
					else await page.getByRole('button', { name: 'Lock device', exact: true }).first().click();
					await expect(
						page.getByRole('heading', { name: 'Workspace locked', exact: true })
					).toBeVisible();
					await expect(form).toHaveCount(0);
				} else {
					await page.route(destination, async (route) => {
						const response = await route.fetch();
						navigationReceived();
						await navigationGate;
						await route.fulfill({ response }).catch(() => {});
					});
					page.on('dialog', (dialog) => dialog.accept());
					await page.getByRole('button', { name: 'Search', exact: true }).click();
					await page.getByRole('combobox', { name: /^Search people/ }).fill('schedule');
					navigation = page
						.getByRole('option', { name: /^Schedule/ })
						.first()
						.click();
					await navigationHeld;
					await expect(form).toBeVisible();
				}
				release();
				await done;
				await page.evaluate(
					() =>
						new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
				);
				await expect(success).toHaveCount(0);
				if (kind === 'save-lock') {
					await page.getByLabel('Device PIN', { exact: true }).fill('654321');
					await page.getByRole('button', { name: 'Unlock workspace', exact: true }).click();
					await expect(form).toBeVisible();
					await expect(success).toHaveCount(0);
					expect(await choice().isChecked()).toBe(!initial);
					await form.getByRole('button', { name: 'Discard changes', exact: true }).click();
				} else {
					// Check while the old page is still mounted, before destination data arrives.
					await expect(form).toBeVisible();
					await expect(success).toHaveCount(0);
					releaseNavigation();
					await navigation;
					await expect(page).toHaveURL(/\/shifts$/);
				}
			} finally {
				release();
				releaseNavigation();
				await page.unroute(pattern);
				await page.unroute(destination);
			}
			// Reopen from the synced source, independently of the interrupted completion.
			await page.goto('/me/notifications');
			await page.getByLabel('Device PIN', { exact: true }).fill('654321');
			await page.getByRole('button', { name: 'Unlock', exact: true }).click();
			await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
			await expect(choice()).toBeEnabled();
			await expect(choice()).toBeChecked({ checked: !initial });
			await choice().setChecked(initial);
			await form
				.getByRole('button', { name: /^Save preferences/ })
				.first()
				.click();
			await expect(success).toBeVisible();
		}
		await expect(choice()).toBeChecked({ checked: initial });
		expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		);
	});
}
