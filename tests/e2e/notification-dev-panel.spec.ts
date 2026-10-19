import { test, expect } from '@playwright/test';

test('production excludes the development notification page and API, including for admins', async ({
	page
}) => {
	expect((await page.goto('/dev/notifications'))?.status()).toBe(404);
	expect((await page.request.get('/dev/notifications/api/recent')).status()).toBe(404);
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('admin@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeVisible();
	expect((await page.goto('/dev/notifications'))?.status()).toBe(404);
	expect((await page.request.get('/dev/notifications/api/recent')).status()).toBe(404);
	expect(
		(
			await page.request.post('/dev/notifications/api/preview', {
				// Exercise the route guard, not the global missing-Origin CSRF rejection.
				headers: { origin: new URL(page.url()).origin },
				data: { type: 'health_alert' }
			})
		).status()
	).toBe(404);
});
