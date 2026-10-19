import { test, expect } from '@playwright/test';

test('a feature outside the plan explains itself and who to ask', async ({ page }) => {
	test.setTimeout(120000);
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('supervisor@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	const confirm = page.getByLabel('Confirm PIN', { exact: true });
	if (await confirm.isVisible()) await confirm.fill('654321');
	await page.getByRole('button', { name: /^(Save PIN and open|Unlock)$/ }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await page.getByRole('link', { name: 'Overview', exact: true }).first().click();

	// The demo agency has every feature, so answer as a plan without summaries would.
	await page.route('**/api/trpc/lomi.summarize**', (route) =>
		route.fulfill({
			status: 403,
			contentType: 'application/json',
			body: JSON.stringify([
				{
					error: {
						json: {
							message: 'Lomi daily summaries require a Professional or Complete subscription.',
							code: -32003,
							data: {
								code: 'FORBIDDEN',
								httpStatus: 403,
								upgradeRequired: true,
								feature: 'lomi_summary'
							}
						}
					}
				}
			])
		})
	);
	await page.getByRole('button', { name: /^(Summarize today|Refresh summary)$/ }).click();
	const dialog = page.getByRole('dialog', { name: 'Not on your plan' });
	await expect(dialog).toBeVisible();
	await expect(dialog).toContainText(
		'Lomi daily summaries require a Professional or Complete subscription.'
	);
	// Supervisors are pointed to their admin; only admins see Contact support.
	await expect(dialog).toContainText('Ask your administrator');
	await expect(dialog.getByRole('link', { name: 'Contact support' })).toHaveCount(0);
	await dialog.getByRole('button', { name: 'Close', exact: true }).click();
	await expect(dialog).toBeHidden();
});
