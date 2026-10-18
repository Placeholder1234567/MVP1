import { test, expect, type Page } from '@playwright/test';

// A supervisor sees what changed in a note they sent back (frontend-audit.md
// finding 14). Lena and Theo Demo are used by no other note test.
const PIN = '654321';

async function signIn(page: Page, email: string) {
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill(email);
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill(PIN);
	await page.getByLabel('Confirm PIN', { exact: true }).fill(PIN);
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Maple House' });
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
}

async function sign(page: Page, text: string) {
	await page.getByLabel('Activities', { exact: true }).fill(text);
	await page.getByRole('button', { name: 'Save draft', exact: true }).click();
	await expect(page.getByText('Draft saved on this device.', { exact: true })).toBeVisible();
	await page.getByRole('checkbox', { name: /I reviewed this note/ }).check();
	await page.getByRole('button', { name: 'Sign and submit', exact: true }).click();
	await expect(page.getByLabel('Activities', { exact: true })).toBeDisabled();
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
}

test('a supervisor compares a resubmitted note with the version they sent back', async ({
	page,
	browser
}, info) => {
	test.skip(info.project.name !== 'desktop', 'Note review is a supervisor desktop screen.');
	test.setTimeout(180000);
	await signIn(page, 'lena@guad.test');
	await page.getByRole('link', { name: /Theo Demo/ }).click();
	await page.getByRole('link', { name: /^Shift note/ }).click();
	await sign(page, 'Theo ate lunch at noon.');

	const supervisor = await browser.newContext({ viewport: page.viewportSize() });
	try {
		const review = await supervisor.newPage();
		await signIn(review, 'supervisor@guad.test');
		await review.getByRole('link', { name: 'Review notes', exact: true }).click();
		const pick = () =>
			review
				.getByRole('button', { name: /Theo Demo/ })
				.filter({ hasText: 'Lena Park' })
				.click();
		await pick();
		await review.getByRole('button', { name: 'Show earlier versions', exact: true }).click();
		await expect(
			review.getByText('This is the first signed version; there is nothing earlier to compare.')
		).toBeVisible();
		await review.getByLabel('Feedback for the author', { exact: true }).fill('What did Theo eat?');
		await review.getByRole('button', { name: 'Send back', exact: true }).click();
		await expect(
			review.getByText('Note returned with your feedback.', { exact: true })
		).toBeVisible();

		// The author revises and signs again (a returned note signs online).
		await expect(page.getByText('What did Theo eat?')).toBeVisible();
		await sign(page, 'Theo ate a full lunch of soup at noon.');

		await review.reload();
		await review.getByLabel('Device PIN', { exact: true }).fill(PIN);
		await review.getByRole('button', { name: 'Unlock', exact: true }).click();
		await review.getByLabel('Current home', { exact: true }).selectOption({ label: 'Maple House' });
		await pick();
		await review.getByRole('button', { name: 'Show earlier versions', exact: true }).click();
		const changes = review.getByRole('region', { name: 'Changes since the last signed version' });
		await expect(changes.getByRole('heading', { name: /^Changes since version 1/ })).toBeVisible();
		await expect(changes.locator('ins')).toContainText(['a full', 'of soup']);
	} finally {
		await supervisor.close();
	}
});
