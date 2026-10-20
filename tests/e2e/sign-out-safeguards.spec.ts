import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page) {
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('supervisor@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Oak House' });
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
}

test('canceling sign-out preserves a saved unfinished care draft across reload', async ({
	page
}, info) => {
	await signIn(page);
	await page.getByRole('link', { name: 'Care records', exact: true }).first().click();
	await page
		.getByRole('link', {
			name: new RegExp(info.project.name === 'phone' ? 'Rosa Demo' : 'Marcus Demo')
		})
		.click();
	await page.getByRole('link', { name: /^Health Vitals/ }).click();
	await page.getByLabel('Pulse', { exact: true }).fill('82');
	await expect(
		page.getByText('Recovery draft saved on this device. Check saved records before submitting.', {
			exact: true
		})
	).toBeVisible();
	const careUrl = page.url();
	// Keep the durable draft while leaving the editor to reach the sign-out action.
	const leave = (dialog: import('@playwright/test').Dialog) => void dialog.accept();
	page.on('dialog', leave);
	await page.getByRole('link', { name: 'Me', exact: true }).first().click();
	page.off('dialog', leave);
	const prompt = page.waitForEvent('dialog').then(async (dialog) => {
		expect(dialog.message()).toContain('unfinished draft');
		await dialog.dismiss();
	});
	await page.getByRole('button', { name: 'Sign out on all devices', exact: true }).click();
	await prompt;
	await expect(page).not.toHaveURL(/\/login/);
	await page.goto(careUrl);
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Unlock', exact: true }).click();
	await expect(
		page.getByRole('button', { name: 'Resume unfinished form', exact: true })
	).toBeVisible();
	await page.getByRole('button', { name: 'Resume unfinished form', exact: true }).click();
	await expect(page.getByLabel('Pulse', { exact: true })).toHaveValue('82');
});

test('a failed server sign-out finishes locally and accurately warns about the session', async ({
	page
}) => {
	await signIn(page);
	await page.getByRole('link', { name: 'Me', exact: true }).first().click();
	await page.route('**/auth/session', async (route) => {
		if (route.request().method() === 'DELETE') await route.abort('internetdisconnected');
		else await route.continue();
	});
	const messages: string[] = [];
	page.on('dialog', (dialog) => {
		messages.push(dialog.message());
		void dialog.accept();
	});
	await page.getByRole('button', { name: 'Sign out on all devices', exact: true }).click();
	await expect(page).toHaveURL(/\/login/);
	expect(messages).toContain(
		'This device’s saved data was cleared, but server sign-out could not be confirmed. Your server session may still be active. Sign in and out again once you’re back online.'
	);
});
