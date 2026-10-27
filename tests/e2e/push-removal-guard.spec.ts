// Removing a push device while the screen locks or the person navigates away:
// the held real removal still completes on the server, but its late response
// must not repaint the push device list or its message in the changed view.
// Synthetic registered devices only (seed.ts push-held-* and push-nav-*).
import { test, expect } from '@playwright/test';

for (const kind of ['lock', 'navigation'] as const) {
	test(`a held push-device removal does not repaint a changed view: ${kind}`, async ({
		page
	}, info) => {
		test.setTimeout(180000);
		const fixture = kind === 'lock' ? 'push-held' : 'push-nav';
		await page.goto('/login');
		await page
			.getByLabel('Email', { exact: true })
			.fill(`${fixture}-${info.project.name}@guad.test`);
		await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
		await page.getByRole('button', { name: 'Sign in', exact: true }).click();
		await page.getByLabel('Device PIN', { exact: true }).fill('654321');
		await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
		await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
		await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
		const openSettings = async () => {
			await page.goto('/me/notifications');
			await page.getByLabel('Device PIN', { exact: true }).fill('654321');
			await page.getByRole('button', { name: 'Unlock', exact: true }).click();
			await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
		};
		await openSettings();

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
		let releaseNav!: () => void, navReceived!: () => void;
		const navGate = new Promise<void>((r) => (releaseNav = r)),
			navHeld = new Promise<void>((r) => (navReceived = r));
		let click: Promise<unknown> | undefined;
		const settle = () =>
			page.evaluate(
				() =>
					new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
			);
		try {
			page.once('dialog', (dialog) => dialog.accept());
			await panel.getByRole('button', { name: 'Remove device 1', exact: true }).click();
			await held;
			if (kind === 'lock') {
				if (info.project.name === 'phone')
					await page.clock.setFixedTime(new Date(Date.now() + 16 * 60 * 1000));
				else await page.getByRole('button', { name: 'Lock device', exact: true }).first().click();
				await expect(
					page.getByRole('heading', { name: 'Workspace locked', exact: true })
				).toBeVisible();
				release();
				await done;
				await settle();
				await page.getByLabel('Device PIN', { exact: true }).fill('654321');
				await page.getByRole('button', { name: 'Unlock workspace', exact: true }).click();
			} else {
				// Hold the destination's data so the old page stays mounted while the
				// removal's response arrives.
				await page.route('**/shifts/__data.json*', async (route) => {
					navReceived();
					await navGate;
					await route.continue().catch(() => {});
				});
				click = page.getByRole('link', { name: 'Shifts', exact: true }).first().click();
				await navHeld;
				release();
				await done;
				await settle();
				await expect(panel).toBeVisible();
			}
			// The late response neither announces the removal nor repaints the old list.
			await expect(removed).toHaveCount(0);
			await expect(panel.getByText('Browser 1', { exact: true })).toHaveCount(0);
			if (kind === 'navigation') {
				releaseNav();
				await click;
				await expect(page).toHaveURL(/\/shifts$/);
			}
		} finally {
			release();
			releaseNav();
			await page.unroute(pattern);
			await page.unroute('**/shifts/__data.json*');
		}
		// Explicit recovery: the removal itself completed on the server.
		if (kind === 'navigation') await openSettings();
		await panel.getByRole('button', { name: 'Refresh push devices', exact: true }).click();
		await expect(
			panel.getByText('No push devices are registered for your account.', { exact: true })
		).toBeVisible();
		await expect(removed).toHaveCount(0);
	});
}
