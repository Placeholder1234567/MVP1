import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';

async function openReview(page: Page, phone: boolean) {
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('supervisor@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await page
		.getByLabel('Current home', { exact: true })
		.selectOption({ label: phone ? 'Maple House' : 'Oak House' });
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	await page.getByRole('link', { name: 'Care records', exact: true }).first().click();
	await page.getByRole('link', { name: new RegExp(phone ? 'Theo Demo' : 'Rosa Demo') }).click();
	await page.getByRole('link', { name: /^Shift note/ }).click();
}

for (const leave of [false, true]) {
	test(`reconnect redrafting ${leave ? 'discards a response after the review is used' : 'preserves edits made before and during the request'}`, async ({
		page,
		context
	}, info) => {
		test.setTimeout(180000);
		await openReview(page, info.project.name === 'phone');
		const observation = 'Synthetic observation: selected a puzzle and placed four pieces.';
		const note = page.locator('form').getByLabel('Activities', { exact: true });
		const initialNote = await note.inputValue();
		await context.setOffline(true);
		await page.getByLabel('Your observations', { exact: true }).fill(observation);
		await page.getByRole('button', { name: 'Prepare a draft', exact: true }).click();
		const review = page.getByRole('group', { name: 'Review Lomi draft', exact: true });
		await expect(review.getByText(/Simple sorting draft/)).toBeVisible();
		await review.getByLabel('Mood', { exact: true }).fill('Caregiver edit.');
		await review.getByLabel('Mood', { exact: true }).fill('');
		let release!: () => void;
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		let requests = 0;
		await page.route(/\/api\/trpc\/lomi\.draft(?:\?|$)/, async (route) => {
			requests++;
			const input = JSON.parse(route.request().postData() ?? '{}')['0'].json;
			expect(input.prompt).toBe(observation);
			await held;
			await route.fulfill({
				contentType: 'application/json',
				body: JSON.stringify([
					{
						result: {
							data: {
								json: {
									content: {
										activities: 'Synthetic refreshed activity.',
										meals: '',
										mood: 'AI mood.',
										health: 'AI health.'
									},
									flags: [],
									incident: { detected: false, summary: '' },
									fallback: false
								}
							}
						}
					}
				])
			});
		});
		try {
			await context.setOffline(false);
			await expect.poll(() => requests).toBe(1);
			if (leave) {
				page.once('dialog', (dialog) => dialog.accept());
				await review
					.getByRole('button', { name: 'Use this reviewed draft in my note', exact: true })
					.click();
				await expect(review).toBeHidden();
				release();
				await expect(note).toHaveValue(observation);
			} else {
				await review
					.getByLabel('Health and safety', { exact: true })
					.fill('Caregiver observation during request.');
				release();
				await expect(review.getByLabel('Activities', { exact: true })).toHaveValue(
					'Synthetic refreshed activity.'
				);
				await expect(review.getByLabel('Mood', { exact: true })).toHaveValue('');
				await expect(review.getByLabel('Health and safety', { exact: true })).toHaveValue(
					'Caregiver observation during request.'
				);
				await expect(
					review.getByText(/Lomi updated untouched sections after reconnecting/)
				).toBeVisible();
				await expect(note).toHaveValue(initialNote);
				expect(
					(await new AxeBuilder({ page }).include('[aria-label="Review Lomi draft"]').analyze())
						.violations
				).toEqual([]);
			}
			await expect(
				page.getByRole('button', { name: 'Sign and submit', exact: true })
			).toBeDisabled();
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
				true
			);
			await page.screenshot({ path: info.outputPath('reconnect-review.png'), fullPage: true });
		} finally {
			release();
			await context.setOffline(false);
		}
	});
}
