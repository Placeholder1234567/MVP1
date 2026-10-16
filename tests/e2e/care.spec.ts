import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PIN = '654321';
const PASSWORD = 'guad-dev-only-1';

async function accessible(page: Page) {
	const result = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(
		result.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }))
	).toEqual([]);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
}

async function signIn(page: Page, email: string) {
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill(email);
	await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Make this device yours' })).toBeVisible();
	await page.getByLabel('Device PIN', { exact: true }).fill(PIN);
	await page.getByLabel('Confirm PIN', { exact: true }).fill(PIN);
	await page.getByRole('button', { name: 'Save PIN and open' }).click();
	await expect(page.getByLabel('Current home', { exact: true })).toBeVisible();
	await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Oak House' });
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
}

async function unlock(page: Page, button = 'Unlock workspace') {
	await page.getByLabel('Device PIN', { exact: true }).fill(PIN);
	await page.getByRole('button', { name: button, exact: true }).click();
	// The submit label changes to Opening… before unlock completes.
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
}

test('sign-in and the public offline gate are accessible with a keyboard', async ({ page }) => {
	await page.goto('/login');
	await accessible(page);
	await page.keyboard.press('Tab');
	await expect(page.getByLabel('Email', { exact: true })).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
	await page.goto('/offline');
	await expect(
		page.getByText('Connect and sign in to prepare or refresh this device for offline use.')
	).toBeVisible();
	await accessible(page);
});

test('caregiver saves, explicitly signs and receives supervisor approval', async ({
	page,
	browser
}, info) => {
	const email = info.project.name === 'phone' ? 'dev@guad.test' : 'cara@guad.test';
	await signIn(page, email);
	await expect(page.getByRole('link', { name: /Marcus Demo/ })).toBeVisible();
	await accessible(page);
	await page.getByRole('link', { name: /Marcus Demo/ }).click();
	await page.getByRole('link', { name: /^Shift note/ }).click();
	const content = `Synthetic ${info.project.name} care workflow: supported a chosen activity.`;
	await page.getByLabel('Activities', { exact: true }).fill(content);
	await expect(page.getByRole('button', { name: 'Sign and submit', exact: true })).toBeDisabled();
	await page.getByRole('button', { name: 'Save draft', exact: true }).click();
	await expect(page.getByText('Draft saved on this device.', { exact: true })).toBeVisible();
	await accessible(page);
	await page.getByRole('checkbox', { name: /I reviewed this note/ }).check();
	await page.getByRole('button', { name: 'Sign and submit', exact: true }).click();
	await expect(page.getByLabel('Activities', { exact: true })).toBeDisabled();
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	const supervisor = await browser.newContext({ viewport: page.viewportSize() });
	try {
		const review = await supervisor.newPage();
		await signIn(review, 'supervisor@guad.test');
		await review.getByRole('link', { name: 'Review notes', exact: true }).click();
		await review
			.getByRole('button', { name: /Marcus Demo/ })
			.filter({ hasText: info.project.name === 'phone' ? 'Dev Okafor' : 'Cara Giver' })
			.click();
		await expect(review.getByText(content, { exact: true })).toBeVisible();
		await expect(review.getByRole('button', { name: 'Approve note', exact: true })).toBeDisabled();
		await accessible(review);
		await review.getByRole('checkbox', { name: /I have read this note/ }).check();
		await review.getByRole('button', { name: 'Approve note', exact: true }).click();
		await expect(review.getByText('Note approved.', { exact: true })).toBeVisible();
		await expect(
			page.getByText('This note is approved. Signed records are read-only.', { exact: true })
		).toBeVisible();
	} finally {
		await supervisor.close();
	}
});

test('PIN and idle locks preserve text; offline restart retains an encrypted draft', async ({
	page,
	context
}, info) => {
	await signIn(page, info.project.name === 'phone' ? 'dev@guad.test' : 'cara@guad.test');
	const person = info.project.name === 'phone' ? 'Rosa Demo' : 'Marcus Demo';
	await page.getByRole('link', { name: new RegExp(person) }).click();
	await page.getByRole('link', { name: /^Behavior note/ }).click();
	const content = `Synthetic ${info.project.name} privacy check: unsaved observations.`;
	await page.getByLabel('What happened right before', { exact: true }).fill(content);
	// Date-only emulation leaves real timers and database workers running normally.
	await page.clock.setFixedTime(new Date(Date.now() + 16 * 60 * 1000));
	await expect(page.getByRole('heading', { name: 'Workspace locked' })).toBeVisible();
	await expect(page.getByLabel('What happened right before', { exact: true })).toBeHidden();
	await accessible(page);
	await page.getByLabel('Device PIN', { exact: true }).fill('000000');
	await page.getByRole('button', { name: 'Unlock workspace', exact: true }).click();
	await expect(page.getByRole('alert')).toHaveText('Wrong PIN. 4 tries left.');
	await unlock(page);
	await expect(page.getByLabel('What happened right before', { exact: true })).toHaveValue(content);
	// Returning the clock to real time also fails closed, then unlock restores normal time.
	await page.clock.setFixedTime(new Date());
	await expect(page.getByRole('heading', { name: 'Workspace locked' })).toBeVisible();
	await unlock(page);
	await expect(page.getByLabel('What happened right before', { exact: true })).toHaveValue(content);
	await page.getByRole('button', { name: 'Save draft', exact: true }).click();
	await expect(page.getByText('Draft saved on this device.', { exact: true })).toBeVisible();
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
	await context.setOffline(true);
	await page.goto('/offline');
	await unlock(page, 'Unlock saved records');
	await page
		.getByRole('combobox', { name: 'Home', exact: true })
		.selectOption({ label: 'Oak House' });
	await page.getByRole('button', { name: new RegExp(`${person}.*draft`) }).click();
	await expect(page.getByLabel('What happened right before', { exact: true })).toHaveValue(content);
	const response = `Synthetic ${info.project.name} draft saved without a connection.`;
	await page.getByLabel('How staff responded', { exact: true }).fill(response);
	await page.getByRole('button', { name: 'Save draft', exact: true }).click();
	await expect(page.getByText('Draft saved on this device.', { exact: true })).toBeVisible();
	await page.reload();
	await unlock(page, 'Unlock saved records');
	await page
		.getByRole('combobox', { name: 'Home', exact: true })
		.selectOption({ label: 'Oak House' });
	await accessible(page);
	await page.getByRole('button', { name: new RegExp(`${person}.*draft`) }).click();
	await expect(page.getByLabel('How staff responded', { exact: true })).toHaveValue(response);
	await context.setOffline(false);
	await page.goto('/today');
	await unlock(page, 'Unlock');
	await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Oak House' });
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	await page.getByRole('link', { name: new RegExp(person) }).click();
	await page.getByRole('link', { name: /^Behavior note/ }).click();
	await expect(page.getByLabel('How staff responded', { exact: true })).toHaveValue(response);
});
