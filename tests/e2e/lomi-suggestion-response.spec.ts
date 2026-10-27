import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';

async function renderBoundary(page: Page) {
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			)
	);
}

async function openReview(page: Page, phone: boolean, kind = /^Shift note/) {
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
	await page.getByRole('link', { name: kind }).click();
}

for (const kind of ['edit', 'route'] as const) {
	test(`a held real Lomi ${kind} suggestion cannot enter a review after privacy lock`, async ({
		page
	}, info) => {
		test.setTimeout(180000);
		await openReview(page, info.project.name === 'phone');
		const note = page.locator('form').getByLabel('Activities', { exact: true });
		const originalNote = await note.inputValue();
		await page.getByLabel('Your observations', { exact: true }).fill('Synthetic garden walk.');
		await page.getByRole('button', { name: 'Prepare a draft', exact: true }).click();
		const review = page.getByRole('group', { name: 'Review Lomi draft', exact: true });
		const activities = review.getByLabel('Activities', { exact: true });
		await expect(activities).toHaveValue('Synthetic garden walk.');
		if (kind === 'edit')
			await review.getByText('Refine activities with Lomi', { exact: true }).click();
		const input = review.getByLabel(
			kind === 'edit'
				? 'Additional observations or corrections for activities'
				: 'Follow-up observations',
			{ exact: true }
		);
		const suggest = review.getByRole('button', {
			name: kind === 'edit' ? 'Suggest a revision' : 'Suggest section updates',
			exact: true
		});
		await input.fill('Staff observed two completed puzzle pieces.');
		let release!: () => void, received!: () => void, finished!: () => void;
		const gate = new Promise<void>((r) => (release = r)),
			held = new Promise<void>((r) => (received = r)),
			done = new Promise<void>((r) => (finished = r));
		const pattern = new RegExp('/api/trpc/lomi\\.' + kind + '(?:\\?|$)');
		let requests = 0;
		await page.route(pattern, async (route) => {
			requests++;
			const response = await route.fetch();
			expect(response.ok()).toBe(true);
			if (requests === 1) {
				received();
				await gate;
			}
			await route.fulfill({ response });
			if (requests === 1) finished();
		});
		try {
			await suggest.click();
			await held;
			if (info.project.name === 'phone')
				await page.clock.setFixedTime(new Date(Date.now() + 16 * 60 * 1000));
			else await page.getByRole('button', { name: 'Lock device', exact: true }).first().click();
			await expect(
				page.getByRole('heading', { name: 'Workspace locked', exact: true })
			).toBeVisible();
			await page.getByLabel('Device PIN', { exact: true }).fill('654321');
			await page.getByRole('button', { name: 'Unlock workspace', exact: true }).click();
			await expect(review).toBeVisible();
			await expect(input).toHaveValue('Staff observed two completed puzzle pieces.');
			await activities.fill('Synthetic caregiver correction after unlock.');
			await input.fill('Staff observed three completed puzzle pieces.');
			release();
			await done;
			await renderBoundary(page);
			await expect(
				review.getByRole('region', { name: 'Proposed changes', exact: true })
			).toHaveCount(0);
			await expect(activities).toHaveValue('Synthetic caregiver correction after unlock.');
			await expect(input).toHaveValue('Staff observed three completed puzzle pieces.');
			await expect(review.getByRole('status')).toContainText('Suggestion interrupted.');
			expect(requests).toBe(1);
			await suggest.click();
			const proposal = review.getByRole('region', { name: 'Proposed changes', exact: true });
			await expect(proposal).toContainText('Staff observed three completed puzzle pieces.');
			expect(requests).toBe(2);
			await expect(note).toHaveValue(originalNote);
			await expect(
				page.getByRole('button', { name: 'Sign and submit', exact: true })
			).toBeDisabled();
			expect(
				(await new AxeBuilder({ page }).include('[aria-label="Review Lomi draft"]').analyze())
					.violations
			).toEqual([]);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
				true
			);
		} finally {
			release();
			await page.unroute(pattern);
		}
	});
}
