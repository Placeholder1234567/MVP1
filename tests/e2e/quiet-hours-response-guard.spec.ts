import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

test.use({ actionTimeout: 30000 });
for (const kind of ['load-lock', 'save-lock', 'cancel-navigation'] as const) {
	test(`quiet hours retains choices and rejects late feedback: ${kind}`, async ({
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
		const form = page.getByRole('form', { name: 'Quiet hours', exact: true });
		await expect(form.getByLabel('Start time', { exact: true })).toBeVisible();
		const initialStart = await form.getByLabel('Start time', { exact: true }).inputValue();
		const initialEnd = await form.getByLabel('End time', { exact: true }).inputValue();
		const nextStart = initialStart === '21:00' ? '22:00' : '21:00';
		const nextEnd = nextStart === '21:00' ? '05:00' : '06:00';
		if (kind !== 'load-lock') {
			await form.getByLabel('Start time', { exact: true }).fill(nextStart);
			await form.getByLabel('End time', { exact: true }).fill(nextEnd);
		}
		if (kind === 'cancel-navigation') {
			page.once('dialog', (dialog) => dialog.dismiss());
			await page.getByRole('link', { name: '← Your alerts', exact: true }).click();
			await expect(page).toHaveURL(/\/me\/notifications$/);
			await expect(form.getByLabel('Start time', { exact: true })).toHaveValue(nextStart);
			await context.setOffline(true);
			await expect(
				form.getByRole('button', { name: 'Save quiet hours', exact: true })
			).toBeDisabled();
			await expect(form.getByLabel('Start time', { exact: true })).toHaveValue(nextStart);
			await context.setOffline(false);
			await form.getByRole('button', { name: 'Discard quiet-hours changes', exact: true }).click();
		} else {
			const method = kind === 'load-lock' ? 'quietHours' : 'setQuietHours';
			const pattern = new RegExp('/api/trpc/[^?]*notification\\.' + method + '(?:[,?]|$)');
			let release!: () => void, received!: () => void, finished!: () => void;
			const done = new Promise<void>((r) => (finished = r));
			const gate = new Promise<void>((r) => (release = r)),
				held = new Promise<void>((r) => (received = r));
			await page.route(pattern, async (route) => {
				const response = await route.fetch();
				expect(response.ok()).toBe(true);
				received();
				await gate;
				await route.fulfill({ response }).catch(() => {});
				finished();
			});
			try {
				await form
					.getByRole('button', {
						name: kind === 'load-lock' ? 'Reload quiet hours' : 'Save quiet hours',
						exact: true
					})
					.click();
				await held;
				if (info.project.name === 'phone')
					await page.clock.setFixedTime(new Date(Date.now() + 16 * 60 * 1000));
				else await page.getByRole('button', { name: 'Lock device', exact: true }).first().click();
				await expect(
					page.getByRole('heading', { name: 'Workspace locked', exact: true })
				).toBeVisible();
				release();
				await done;
				await page.evaluate(
					() =>
						new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
				);
				await expect(form).toHaveCount(0);
				await page.getByLabel('Device PIN', { exact: true }).fill('654321');
				await page.getByRole('button', { name: 'Unlock workspace', exact: true }).click();
				await expect(form).toBeVisible();
				await expect(
					form.getByText('Quiet hours saved. High and urgent alerts still arrive immediately.', {
						exact: true
					})
				).toHaveCount(0);
			} finally {
				release();
				await page.unroute(pattern);
			}
			if (kind === 'save-lock') {
				await expect(form.getByLabel('Start time', { exact: true })).toHaveValue(nextStart);
				await form
					.getByRole('button', { name: 'Discard quiet-hours changes', exact: true })
					.click();
			}
			await form.getByRole('button', { name: 'Reload quiet hours', exact: true }).click();
			await expect(
				form.getByRole('button', { name: 'Reload quiet hours', exact: true })
			).toBeEnabled();
			await expect(form.getByLabel('Start time', { exact: true })).toHaveValue(
				kind === 'save-lock' ? nextStart : initialStart
			);
			if (kind === 'save-lock') {
				await form.getByLabel('Start time', { exact: true }).fill(initialStart);
				await form.getByLabel('End time', { exact: true }).fill(initialEnd);
				await form.getByRole('button', { name: 'Save quiet hours', exact: true }).click();
				await expect(
					form.getByText('Quiet hours saved. High and urgent alerts still arrive immediately.', {
						exact: true
					})
				).toBeVisible();
			}
		}
		expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		);
	});
}
