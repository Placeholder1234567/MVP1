import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

test.use({ actionTimeout: 30000 });

for (const change of [
	'load-home',
	'export-home',
	'export-lock',
	'export-navigation',
	'export-period'
] as const) {
	test(`timesheets discard stale responses and preserve loaded scope: ${change}`, async ({
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
		await page.getByRole('link', { name: 'Timesheets', exact: true }).first().click();
		const load = page.getByRole('button', { name: 'Load timesheet', exact: true });
		const form = page.locator('form').filter({ has: load });
		await form.getByLabel('From', { exact: true }).fill('2026-01-01T00:00');
		await form.getByLabel('To', { exact: true }).fill('2026-01-02T00:00');
		const expectedPeriod = await page.evaluate(() => ({
			from: new Date('2026-01-01T00:00').toISOString(),
			to: new Date('2026-01-02T00:00').toISOString()
		}));
		const json = page.getByRole('button', { name: 'Download JSON', exact: true });
		if (change !== 'load-home') {
			await load.click();
			await expect(json).toBeEnabled();
		}
		if (change === 'export-period') {
			await context.setOffline(true);
			await expect(load).toBeDisabled();
			await expect(json).toBeDisabled();
			await expect(form.getByLabel('From', { exact: true })).toHaveValue('2026-01-01T00:00');
			await context.setOffline(false);
			await expect(json).toBeEnabled();
			expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
				true
			);
		}
		let downloads = 0;
		page.on('download', () => downloads++);
		let release!: () => void;
		let received!: () => void;
		let finished!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const held = new Promise<void>((r) => (received = r));
		const done = new Promise<void>((r) => (finished = r));
		const pattern =
			change === 'load-home'
				? /\/api\/trpc\/[^?]*clock\.timesheet(?:[,?]|$)/
				: /\/api\/trpc\/[^?]*report\.exportTimesheet(?:[,?]|$)/;
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
			await (change === 'load-home' ? load : json).click();
			await held;
			if (change.endsWith('home')) {
				await page
					.getByLabel('Current home', { exact: true })
					.selectOption({ label: 'Maple House' });
				await expect(json).toBeHidden();
				await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Oak House' });
				await expect(load).toBeEnabled();
			} else if (change === 'export-lock') {
				if (info.project.name === 'phone')
					await page.clock.setFixedTime(new Date(Date.now() - 60000));
				else await page.getByRole('button', { name: 'Lock device', exact: true }).first().click();
				await expect(
					page.getByRole('heading', { name: 'Workspace locked', exact: true })
				).toBeVisible();
			} else if (change === 'export-navigation') {
				await page.getByRole('button', { name: 'Search', exact: true }).click();
				await page.getByRole('combobox', { name: /^Search people/ }).fill('schedule');
				await page
					.getByRole('option', { name: /^Schedule/ })
					.first()
					.click();
				await expect(page).toHaveURL(/\/shifts$/);
			} else {
				await form.getByLabel('From', { exact: true }).fill('2026-02-01T00:00');
				await form.getByLabel('To', { exact: true }).fill('2026-02-02T00:00');
			}
			const download = change === 'export-period' ? page.waitForEvent('download') : undefined;
			release();
			await done;
			await settled;
			await page.evaluate(
				() =>
					new Promise<void>((resolve) =>
						requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
					)
			);
			if (download) {
				const file = await download;
				const path = info.outputPath('synthetic-payroll.json');
				await file.saveAs(path);
				expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({
					version: 1,
					...expectedPeriod
				});
				expect(downloads).toBe(1);
				await expect(page.getByText(/^Exported \d+ records\./)).toBeVisible();
			} else {
				expect(downloads).toBe(0);
				await expect(json).toBeHidden();
				await expect(page.getByText(/^Exported \d+ records\./)).toHaveCount(0);
			}
		} finally {
			release();
			await page.unroute(pattern);
		}
	});
}
