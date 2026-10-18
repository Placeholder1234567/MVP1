import { test, expect } from '@playwright/test';

// The Today greeting counts down to the end of the shift (frontend-spec-2.md §1).
test('the Today greeting shows how long is left in the shift', async ({ page }, info) => {
	test.skip(info.project.name !== 'phone', 'A caregiver phone screen.');
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('cara@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	const confirm = page.getByLabel('Confirm PIN', { exact: true });
	if (await confirm.isVisible()) await confirm.fill('654321');
	await page.getByRole('button', { name: /^(Save PIN and open|Unlock)$/ }).click();
	await expect(page.getByRole('heading', { level: 1, name: /^Hello,/ })).toBeVisible();
	const left = page.getByTestId('shift-left');
	await expect(left).toHaveText(/^(\d+h )?(\d+m )?left$/);
	// Never more than a whole shift.
	const [, h = '0'] = /^(\d+)h/.exec(await left.innerText()) ?? [];
	expect(Number(h)).toBeLessThanOrEqual(8);
});
