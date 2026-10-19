import { test, expect } from '@playwright/test';

// One tab at a time owns the encrypted device database (offline-sync.md test
// 10). A second tab says so instead of hanging, and opens once the first goes.
test('a second tab waits for the first instead of hanging', async ({ page, context }) => {
	test.setTimeout(120000);
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('cara@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');

	const second = await context.newPage();
	await second.goto('/today');
	await second.getByLabel('Device PIN', { exact: true }).fill('654321');
	await second.getByRole('button', { name: 'Unlock', exact: true }).click();
	await expect(second.getByText(/Guad is open in another tab/)).toBeVisible();
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');

	// Closing the first tab frees the database; the second opens by itself.
	await page.close();
	await expect(second.getByTestId('sync-status')).toHaveText('All changes synced');
	await expect(second.getByText(/Guad is open in another tab/)).toBeHidden();
});

test('another person signing in on a waiting tab opens their own database, never the waiting one', async ({
	page,
	context
}) => {
	test.setTimeout(150000);
	const signInAndUnlock = async (tab: typeof page, email: string) => {
		if (!tab.url().endsWith('/login')) await tab.goto('/login');
		await tab.getByLabel('Email', { exact: true }).fill(email);
		await tab.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
		await tab.getByRole('button', { name: 'Sign in', exact: true }).click();
		await tab.getByLabel('Device PIN', { exact: true }).fill('654321');
		const confirm = tab.getByLabel('Confirm PIN', { exact: true });
		if (await confirm.isVisible()) await confirm.fill('654321');
		await tab.getByRole('button', { name: /^(Save PIN and open|Unlock)$/ }).click();
	};
	await signInAndUnlock(page, 'cara@guad.test');
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');

	// A second tab waits for Cara's database, then signs out while waiting.
	const second = await context.newPage();
	await second.goto('/today');
	await second.getByLabel('Device PIN', { exact: true }).fill('654321');
	await second.getByRole('button', { name: 'Unlock', exact: true }).click();
	await expect(second.getByText(/Guad is open in another tab/)).toBeVisible();
	await second.getByRole('button', { name: 'Sign out', exact: true }).click();
	await second.waitForURL(/\/login/);
	// Signing out ends every session: Cara's first tab closes her database too,
	// so it can't upload her queue under whoever signs in next.
	await page.waitForURL(/\/login/);

	// Dev signs in on that tab: Dev's own database opens at once (it is a
	// different file), rather than joining the wait for Cara's.
	await signInAndUnlock(second, 'dev@guad.test');
	await expect(second.getByTestId('sync-status')).toHaveText('All changes synced');
	await expect(second.getByText(/Guad is open in another tab/)).toBeHidden();
	const held = await second.evaluate(async () =>
		(await navigator.locks.query()).held
			?.map((l) => l.name)
			.filter((n) => n?.startsWith('guad-db:'))
	);
	expect(held).toHaveLength(1);
});
