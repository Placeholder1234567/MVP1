import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

test.use({ actionTimeout: 30000 });

for (const change of ['list-lock', 'detail-close', 'export-lock', 'export-navigation'] as const) {
	test(`audit responses stay in the requested private view: ${change}`, async ({
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
		await page.getByRole('button', { name: 'Search', exact: true }).click();
		await page.getByRole('combobox', { name: /^Search people/ }).fill('audit');
		await page
			.getByRole('option', { name: /^Audit log/ })
			.first()
			.click();
		await expect(page.getByRole('heading', { name: 'Audit log', exact: true })).toBeVisible();
		const entries = page.getByRole('group', { name: 'Audit entries', exact: true });
		const show = page.getByRole('button', { name: 'Show entries', exact: true });
		const csv = page.getByRole('button', { name: 'Download CSV', exact: true });
		await expect(entries.getByRole('button').first()).toBeVisible();
		await expect(show).toBeEnabled();
		if (change.startsWith('export')) {
			await page.getByLabel('From', { exact: true }).fill('2026-01-01');
			await page.getByLabel('To', { exact: true }).fill('2026-01-02');
		}
		if (change === 'export-lock') {
			await context.setOffline(true);
			await expect(show).toBeDisabled();
			await expect(csv).toBeDisabled();
			await expect(page.getByLabel('From', { exact: true })).toHaveValue('2026-01-01');
			await context.setOffline(false);
			await expect(csv).toBeEnabled();
			expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
				true
			);
		}
		const method = change === 'list-lock' ? 'list' : change === 'detail-close' ? 'get' : 'export';
		const pattern = new RegExp('/api/trpc/[^?]*audit\\.' + method + '(?:[,?]|$)');
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
		let downloads = 0;
		page.on('download', () => downloads++);
		let releaseNavigation: (() => void) | undefined;
		let completeNavigation: (() => Promise<void>) | undefined;
		try {
			await (
				change === 'list-lock'
					? show
					: change === 'detail-close'
						? entries.getByRole('button').first()
						: csv
			).click();
			await held;
			if (change.endsWith('lock')) {
				if (info.project.name === 'phone')
					await page.clock.setFixedTime(new Date(Date.now() + 16 * 60 * 1000));
				else await page.getByRole('button', { name: 'Lock device', exact: true }).first().click();
				await expect(
					page.getByRole('heading', { name: 'Workspace locked', exact: true })
				).toBeVisible();
			} else if (change === 'detail-close') {
				await page
					.getByRole('article', { name: 'Audit entry', exact: true })
					.getByRole('button', { name: 'Close', exact: true })
					.click();
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
				const navigationClick = page
					.getByRole('option', { name: /^Schedule/ })
					.first()
					.click();
				await destinationHeld;
				completeNavigation = async () => {
					releaseNavigation?.();
					await navigationClick;
					await expect(page).toHaveURL(/\/shifts$/);
				};
			}
			release();
			await done;
			await settled;
			await page.evaluate(
				() =>
					new Promise<void>((resolve) =>
						requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
					)
			);
			expect(downloads).toBe(0);
			if (completeNavigation) await completeNavigation();
			if (change.endsWith('lock')) {
				await page.getByLabel('Device PIN', { exact: true }).fill('654321');
				await page.getByRole('button', { name: 'Unlock workspace', exact: true }).click();
				await expect(
					page.getByRole('heading', { name: 'Workspace locked', exact: true })
				).toBeHidden();
				await expect(entries.getByRole('button')).toHaveCount(0);
			}
			await expect(page.getByRole('article', { name: 'Audit entry', exact: true })).toHaveCount(0);
			expect(downloads).toBe(0);
			await expect(page.getByText(/^Downloaded \d+ entr/)).toHaveCount(0);
			if (change === 'export-lock') {
				await page.unroute(pattern);
				const event = page.waitForEvent('download');
				await csv.click();
				const file = await event;
				const path = info.outputPath('synthetic-audit.csv');
				await file.saveAs(path);
				expect(await readFile(path, 'utf8')).toContain(
					'"Time (UTC)","Action","Record type","Record ID","Done by","Done by ID","Entry ID"'
				);
				expect(downloads).toBe(1);
			}
		} finally {
			releaseNavigation?.();
			release();
			await page.unroute(pattern);
		}
	});
}
