import { test, expect } from '@playwright/test';

// The installed app's icon shows the unread alert count (notifications.md
// "Badge Management"): the same number as the in-app Alerts link, cleared on
// sign-out. The Badging API is recorded instead of touching the real icon.
test('the app icon badge follows unread alerts and clears on sign-out', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop', 'One run is enough for the icon badge.');
	let last: number | null = null;
	await page.exposeFunction('recordBadge', (n: number) => {
		last = n;
	});
	await page.addInitScript(() => {
		const record = (window as unknown as { recordBadge(n: number): Promise<void> }).recordBadge;
		Object.assign(navigator, {
			setAppBadge: (n?: number) => record(n ?? 0),
			clearAppBadge: () => record(0)
		});
	});
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('admin@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');

	const alerts = page.getByRole('link', { name: /^Alerts/ }).first();
	const shown = async () => Number((await alerts.textContent())?.match(/\((\d+)\)/)?.[1] ?? 0);
	await expect.poll(async () => last !== null && last === (await shown())).toBe(true);

	page.on('dialog', (d) => d.accept());
	await page.getByRole('link', { name: 'Me', exact: true }).first().click();
	await page.getByRole('button', { name: 'Sign out on all devices', exact: true }).click();
	await expect(page).toHaveURL(/\/login/);
	expect(last).toBe(0);
});
