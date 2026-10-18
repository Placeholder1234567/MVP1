import { test, expect } from '@playwright/test';

// Goal milestone (frontend-spec-3.md §13 item 40): every trial Independent.
test('a goal with every trial Independent is celebrated, with or without motion', async ({
	page
}, info) => {
	test.skip(
		info.project.name !== 'desktop',
		'One run is enough; the phone layout is the same card.'
	);
	test.setTimeout(180000);
	const title = 'Synthetic milestone goal: makes a snack';
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('supervisor@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Maple House' });
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	await page.getByRole('link', { name: 'Goals', exact: true }).first().click();
	await page
		.getByRole('combobox', { name: 'Goal home', exact: true })
		.selectOption({ label: 'Maple House' });
	await page
		.getByRole('combobox', { name: 'Goal person', exact: true })
		.selectOption({ label: 'Theo Demo' });
	await page.getByLabel('Goal area', { exact: true }).fill('Synthetic milestone');
	await page.getByLabel('Goal wording', { exact: true }).fill(title);
	await page.getByRole('button', { name: 'Create goal', exact: true }).click();
	await expect(
		page.getByText('Goal saved. Care records receive the change after sync.', { exact: true })
	).toBeVisible();

	await page.getByRole('link', { name: 'Care records', exact: true }).first().click();
	await page.getByRole('link', { name: /Theo Demo/ }).click();
	await page.getByRole('link', { name: /^Shift note/ }).click();
	const card = page.locator('section.card').filter({ hasText: title });
	const add = card.getByRole('combobox', { name: 'Add a trial', exact: true });
	await add.selectOption('Independent');
	await expect(card.getByRole('status')).toHaveCount(0);
	await add.selectOption('Independent');
	await expect(card.getByRole('status')).toHaveText(/Independent on every trial\s+this\s+shift/);
	await expect(card).toHaveClass(/milestone/);
	await page.emulateMedia({ reducedMotion: 'reduce' });
	expect(
		await card.locator('.milestone-check').evaluate((el) => getComputedStyle(el).animationName)
	).toBe('none');
	await add.selectOption('Verbal prompt');
	await expect(card.getByRole('status')).toHaveCount(0);
});
