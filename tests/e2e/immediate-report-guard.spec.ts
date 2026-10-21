import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

test.use({ actionTimeout: 30000 });

for (const change of ['home', 'lock', 'navigation', 'dates'] as const) {
	test(`immediate Care export handles a held real response after ${change} changes`, async ({
		page,
		context
	}, info) => {
		test.setTimeout(120000);
		await page.goto('/login');
		await page.getByLabel('Email', { exact: true }).fill('supervisor@guad.test');
		await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
		await page.getByRole('button', { name: 'Sign in', exact: true }).click();
		await page.getByLabel('Device PIN', { exact: true }).fill('654321');
		await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
		await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
		await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
		await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Oak House' });
		await page.getByRole('link', { name: 'Timesheets', exact: true }).first().click();
		await page.getByRole('link', { name: 'Care record reports →', exact: true }).click();
		const button = page.getByRole('button', { name: 'Download care report', exact: true });
		const form = page.locator('form').filter({ has: button });
		await form.getByLabel('Report', { exact: true }).selectOption('health');
		await form.getByLabel('Format', { exact: true }).selectOption('json');
		await form.getByLabel('From', { exact: true }).fill('2026-01-01');
		await form.getByLabel('Through', { exact: true }).fill('2026-01-01');
		if (change === 'dates') {
			await context.setOffline(true);
			await expect(button).toBeDisabled();
			await expect(form.getByLabel('From', { exact: true })).toHaveValue('2026-01-01');
			await context.setOffline(false);
			expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
				true
			);
		}
		await expect(button).toBeEnabled();
		let downloads = 0;
		page.on('download', () => downloads++);
		let release!: () => void;
		let received!: () => void;
		let finished!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const held = new Promise<void>((r) => (received = r));
		const done = new Promise<void>((r) => (finished = r));
		const pattern = /\/api\/trpc\/[^?]*report\.exportClinical(?:[,?]|$)/;
		const settled = new Promise<void>((resolve) => {
			const completed = (request: import('@playwright/test').Request) => {
				if (pattern.test(request.url())) resolve();
			};
			page.on('requestfinished', completed);
			page.on('requestfailed', completed);
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
		try {
			await button.click();
			await held;
			if (change === 'home') {
				await page
					.getByLabel('Current home', { exact: true })
					.selectOption({ label: 'Maple House' });
				await expect(form).toContainText('Maple House');
				await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Oak House' });
				await expect(form).toContainText('Oak House');
			} else if (change === 'lock') {
				if (info.project.name === 'phone')
					await page.clock.setFixedTime(new Date(Date.now() - 60000));
				else await page.getByRole('button', { name: 'Lock device', exact: true }).first().click();
				await expect(
					page.getByRole('heading', { name: 'Workspace locked', exact: true })
				).toBeVisible();
			} else if (change === 'navigation') {
				await page.getByRole('button', { name: 'Search', exact: true }).click();
				await page.getByRole('combobox', { name: /^Search people/ }).fill('schedule');
				await page
					.getByRole('option', { name: /^Schedule/ })
					.first()
					.click();
				await expect(page).toHaveURL(/\/shifts$/);
			} else {
				await form.getByLabel('From', { exact: true }).fill('2026-01-02');
				await form.getByLabel('Through', { exact: true }).fill('2026-01-02');
			}
			const download = change === 'dates' ? page.waitForEvent('download') : undefined;
			release();
			await done;
			await settled;
			// Let response handlers and UI updates finish before asserting disposal.
			await page.evaluate(
				() =>
					new Promise<void>((resolve) =>
						requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
					)
			);
			if (download) {
				const file = await download;
				const path = info.outputPath('synthetic-immediate-report.json');
				await file.saveAs(path);
				expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({
					type: 'health',
					fromDay: '2026-01-01',
					toDay: '2026-01-01'
				});
				await expect(
					page.getByText(/^Downloaded \d+ records\. Period: 2026-01-01 through 2026-01-01/)
				).toBeVisible();
				expect(downloads).toBe(1);
			} else {
				if (change === 'home') await expect(button).toBeEnabled();
				else await expect(button).toBeHidden();
				expect(downloads).toBe(0);
				await expect(page.getByText(/^Downloaded \d+ records/)).toHaveCount(0);
			}
		} finally {
			release();
			await page.unroute(pattern);
		}
	});
}
