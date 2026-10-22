import { test, expect } from '@playwright/test';

test.use({ actionTimeout: 30000 });

for (const source of ['coverage', 'queued'] as const) {
	test(`${source} downloads are discarded while destination navigation is pending`, async ({
		page
	}) => {
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
		await expect(
			page.getByRole('heading', { name: 'Records ready for review.', exact: true })
		).toBeVisible();
		if (source === 'coverage') {
			const section = page.getByRole('region', { name: 'Coverage log export', exact: true });
			await section.getByLabel('Coverage from', { exact: true }).fill('2026-01-01');
			await section.getByLabel('Coverage through', { exact: true }).fill('2026-01-01');
			await section.getByLabel('Coverage format', { exact: true }).selectOption('json');
		} else {
			await page.getByRole('link', { name: 'Prepare a larger care report →', exact: true }).click();
			await expect(
				page.getByRole('heading', { name: 'Prepare a larger care report.', exact: true })
			).toBeVisible();
			await page.getByRole('combobox', { name: 'Report', exact: true }).selectOption('health');
			await page.getByRole('combobox', { name: 'Format', exact: true }).selectOption('json');
			await page.getByLabel('From', { exact: true }).fill('2026-01-01');
			await page.getByLabel('Through', { exact: true }).fill('2026-01-01');
			await page.getByRole('button', { name: 'Request background report', exact: true }).click();
			await expect(page.getByRole('heading', { name: 'Report ready', exact: true })).toBeVisible({
				timeout: 90000
			});
		}
		const button = page.getByRole('button', {
			name: source === 'coverage' ? 'Download coverage log' : 'Download prepared report',
			exact: true
		});
		const pattern =
			source === 'coverage'
				? /\/api\/trpc\/[^?]*report\.exportCoverage(?:[,?]|$)/
				: /\/api\/trpc\/[^?]*report\.downloadBackground(?:[,?]|$)/;
		let release!: () => void;
		let received!: () => void;
		let finished!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		const held = new Promise<void>((r) => (received = r));
		const done = new Promise<void>((r) => (finished = r));
		let downloads = 0;
		page.on('download', () => downloads++);
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
		let releaseNavigation!: () => void;
		let destinationRequested!: () => void;
		const destinationHeld = new Promise<void>((r) => (destinationRequested = r));
		const destinationGate = new Promise<void>((r) => (releaseNavigation = r));
		await page.route('**/shifts/__data.json*', async (route) => {
			destinationRequested();
			await destinationGate;
			await route.continue().catch(() => {});
		});
		try {
			await expect(button).toBeEnabled();
			await button.click();
			await held;
			await page.getByRole('button', { name: 'Search', exact: true }).click();
			await page.getByRole('combobox', { name: /^Search people/ }).fill('schedule');
			const navigationClick = page
				.getByRole('option', { name: /^Schedule/ })
				.first()
				.click();
			await destinationHeld;
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
			releaseNavigation();
			await navigationClick;
			await expect(page).toHaveURL(/\/shifts$/);
			await expect(button).toBeHidden();
			expect(downloads).toBe(0);
		} finally {
			releaseNavigation();
			release();
			await page.unroute(pattern);
		}
	});
}
