import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

test('push list reads and removal serialize with a real registered device', async ({
	page,
	context
}, info) => {
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill(`push-${info.project.name}@guad.test`);
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
	const remove = panel.getByRole('button', { name: 'Remove device 1', exact: true });
	const refresh = panel.getByRole('button', { name: 'Refresh push devices', exact: true });
	await expect(remove).toBeEnabled();
	await expect(panel.getByText('Browser 1', { exact: true })).toBeVisible();
	await context.setOffline(true);
	await expect(remove).toBeDisabled();
	await expect(refresh).toBeDisabled();
	await expect(panel.getByText('Browser 1', { exact: true })).toBeVisible();
	await context.setOffline(false);
	await expect(refresh).toBeEnabled();

	let releaseList!: () => void, listReceived!: () => void;
	const listGate = new Promise<void>((r) => (releaseList = r));
	const listHeld = new Promise<void>((r) => (listReceived = r));
	const listPattern = /\/api\/trpc\/[^?]*notification\.pushDevices(?:[,?]|$)/;
	let releaseRemove!: () => void, removeReceived!: () => void;
	const removeGate = new Promise<void>((r) => (releaseRemove = r));
	const removeHeld = new Promise<void>((r) => (removeReceived = r));
	const removePattern = /\/api\/trpc\/[^?]*notification\.removePushDevice(?:[,?]|$)/;
	let removals = 0;
	await page.route(listPattern, async (route) => {
		const response = await route.fetch();
		expect(response.ok()).toBe(true);
		listReceived();
		await listGate;
		await route.fulfill({ response });
	});
	await page.route(removePattern, async (route) => {
		removals++;
		const response = await route.fetch();
		expect(response.ok()).toBe(true);
		removeReceived();
		await removeGate;
		await route.fulfill({ response });
	});
	try {
		await refresh.click();
		await listHeld;
		await expect(remove).toBeDisabled();
		// Native disabled controls must not issue a mutation even for a forced click.
		await remove.click({ force: true });
		expect(removals).toBe(0);
		releaseList();
		await expect(remove).toBeEnabled();
		await page.unroute(listPattern);
		page.once('dialog', (dialog) => dialog.accept());
		await remove.click();
		await removeHeld;
		await expect(remove).toBeDisabled();
		await expect(refresh).toBeDisabled();
		releaseRemove();
		await expect(remove).toHaveCount(0);
		await expect(panel.getByRole('status')).toHaveText(
			'Push device removed. A delivery already in progress may still arrive.'
		);
		expect(removals).toBe(1);
		await refresh.click();
		await expect(
			panel.getByText('No push devices are registered for your account.', { exact: true })
		).toBeVisible();
		await expect(remove).toHaveCount(0);
		expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		);
	} finally {
		releaseList();
		releaseRemove();
		await page.unroute(listPattern);
		await page.unroute(removePattern);
	}
});
