// Removing a push device while the screen locks:
// the held real removal still completes on the server, but its late response
// must not repaint the push device list or its message in the changed view.
// Synthetic registered devices only (seed.ts push-held-* fixtures).
import { test, expect } from '@playwright/test';

test('a held push-device removal does not repaint a locked view', async ({ page }, info) => {
	test.setTimeout(180000);
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill(`push-held-${info.project.name}@guad.test`);
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	await page.goto('/me/notifications');
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Unlock', exact: true }).click();
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');

	const panel = page.getByRole('region', { name: 'Push devices', exact: true });
	const removed = panel.getByText(
		'Push device removed. A delivery already in progress may still arrive.',
		{ exact: true }
	);
	await expect(panel.getByText('Browser 1', { exact: true })).toBeVisible();
	let release!: () => void, received!: () => void, finished!: () => void;
	const gate = new Promise<void>((r) => (release = r)),
		held = new Promise<void>((r) => (received = r)),
		done = new Promise<void>((r) => (finished = r));
	const pattern = /\/api\/trpc\/[^?]*notification\.removePushDevice(?:[,?]|$)/;
	await page.route(pattern, async (route) => {
		const response = await route.fetch();
		expect(response.ok()).toBe(true);
		received();
		await gate;
		await route.fulfill({ response }).catch(() => {});
		finished();
	});
	try {
		page.once('dialog', (dialog) => dialog.accept());
		await panel.getByRole('button', { name: 'Remove device 1', exact: true }).click();
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
			() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
		);
		await page.getByLabel('Device PIN', { exact: true }).fill('654321');
		await page.getByRole('button', { name: 'Unlock workspace', exact: true }).click();
		// The late response neither announces the removal nor repaints the old list.
		await expect(removed).toHaveCount(0);
		await expect(panel.getByText('Browser 1', { exact: true })).toHaveCount(0);
	} finally {
		release();
		await page.unroute(pattern);
	}
	// The removal itself completed on the server: a fresh read shows no devices.
	await panel.getByRole('button', { name: 'Refresh push devices', exact: true }).click();
	await expect(
		panel.getByText('No push devices are registered for your account.', { exact: true })
	).toBeVisible();
	await expect(removed).toHaveCount(0);
});
