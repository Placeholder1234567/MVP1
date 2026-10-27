import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { draftLocally } from '../../src/lib/domain/lomi';

async function unlock(page: Page, phone: boolean) {
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Unlock', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await page
		.getByLabel('Current home', { exact: true })
		.selectOption({ label: phone ? 'Maple House' : 'Oak House' });
}
async function open(page: Page, phone: boolean) {
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
const saved = (page: Page) =>
	expect(page.getByTestId('lomi-recovery-status')).toContainText(
		'Saved Lomi review on this encrypted device.'
	);

test('encrypted reload recovery keeps original observations, review edits and edits after Use', async ({
	page
}, info) => {
	test.setTimeout(180000);
	const phone = info.project.name === 'phone';
	await open(page, phone);
	const observation = 'Synthetic garden walk. Ate dinner. Read a book.';
	let fallback = true,
		requests = 0;
	await page.route(/\/api\/trpc\/lomi\.draft(?:\?|$)/, async (route) => {
		requests++;
		if (fallback) {
			await route.abort('failed');
			return;
		}
		const result = {
			...draftLocally(observation, 'shift'),
			content: {
				activities: 'Synthetic AI rewrite.',
				meals: 'Synthetic AI meal.',
				mood: '',
				health: ''
			},
			fallback: false
		};
		await route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify([{ result: { data: { json: result } } }])
		});
	});
	const noteActivities = page.locator('form').getByLabel('Activities', { exact: true });
	const originalNote = await noteActivities.inputValue();
	await page.getByLabel('Your observations', { exact: true }).fill(observation);
	await page.getByRole('button', { name: 'Prepare a draft', exact: true }).click();
	const review = page.getByRole('group', { name: 'Review Lomi draft', exact: true });
	await expect(review.getByText(/Simple sorting draft/)).toBeVisible();
	await review
		.getByLabel('Activities', { exact: true })
		.fill('Synthetic caregiver protected wording.');
	await saved(page);
	page.once('dialog', (dialog) => void dialog.accept());
	await page.reload();
	await unlock(page, phone);
	await expect(review).toHaveCount(0);
	await expect(
		page.getByRole('button', { name: 'Resume saved Lomi review', exact: true })
	).toBeVisible();
	expect(requests).toBe(1);
	await expect(noteActivities).toHaveValue(originalNote);
	fallback = false;
	await page.getByRole('button', { name: 'Resume saved Lomi review', exact: true }).click();
	await expect.poll(() => requests).toBe(2);
	await expect(review.getByLabel('Meals', { exact: true })).toHaveValue('Synthetic AI meal.');
	await expect(review.getByLabel('Activities', { exact: true })).toHaveValue(
		'Synthetic caregiver protected wording.'
	);
	await review.getByText('What I said', { exact: true }).click();
	await expect(review.getByText(observation, { exact: true })).toBeVisible();
	await expect(noteActivities).toHaveValue(originalNote);
	page.once('dialog', (dialog) => void dialog.accept());
	await review
		.getByRole('button', { name: 'Use this reviewed draft in my note', exact: true })
		.click();
	await expect(page.getByRole('form', { name: 'Care note', exact: true })).toBeFocused();
	await expect(
		page.getByRole('form', { name: 'Care note', exact: true }).getByRole('status')
	).toContainText('Using a draft does not save or submit the note.');
	await noteActivities.fill('Synthetic edit after Use.');
	await page.getByRole('button', { name: 'Save draft', exact: true }).click();
	await expect(page.getByText('Draft saved on this device.', { exact: true })).toBeVisible();
	await saved(page);
	await page.reload();
	await unlock(page, phone);
	await expect(
		page.getByRole('button', { name: 'Resume saved Lomi review', exact: true })
	).toBeVisible();
	await page.getByRole('button', { name: 'Resume saved Lomi review', exact: true }).click();
	await expect(review.getByLabel('Activities', { exact: true })).toHaveValue(
		'Synthetic edit after Use.'
	);
	await expect(noteActivities).toHaveValue('Synthetic edit after Use.');
	expect(
		await page.evaluate(
			(marker) =>
				[localStorage, sessionStorage].some((storage) =>
					Object.values(storage).join('').includes(marker)
				),
			observation
		)
	).toBe(false);
	expect(
		(
			await new AxeBuilder({ page })
				.include('section[aria-label="Lomi drafting assistant"]')
				.analyze()
		).violations
	).toEqual([]);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('saved Lomi recovery stays in its home and explicit discard survives reload', async ({
	page
}, info) => {
	test.setTimeout(180000);
	const phone = info.project.name === 'phone';
	await open(page, phone);
	await page.route(/\/api\/trpc\/lomi\.draft(?:\?|$)/, (route) => route.abort('failed'));
	await page
		.getByLabel('Your observations', { exact: true })
		.fill('Synthetic scoped recovery observation.');
	await page.getByRole('button', { name: 'Prepare a draft', exact: true }).click();
	await saved(page);
	const url = page.url();
	page.once('dialog', (dialog) => void dialog.accept());
	await page.reload();
	await unlock(page, phone);
	await expect(
		page.getByRole('button', { name: 'Resume saved Lomi review', exact: true })
	).toBeVisible();
	await page
		.getByLabel('Current home', { exact: true })
		.selectOption({ label: phone ? 'Oak House' : 'Maple House' });
	await expect(
		page.getByRole('button', { name: 'Resume saved Lomi review', exact: true })
	).toHaveCount(0);
	await page
		.getByLabel('Current home', { exact: true })
		.selectOption({ label: phone ? 'Maple House' : 'Oak House' });
	await page.goto(url);
	await unlock(page, phone);
	await expect(
		page.getByRole('button', { name: 'Resume saved Lomi review', exact: true })
	).toBeVisible();
	page.once('dialog', (dialog) => void dialog.accept());
	await page.getByRole('button', { name: 'Discard saved Lomi review', exact: true }).click();
	await expect(
		page.getByRole('button', { name: 'Resume saved Lomi review', exact: true })
	).toHaveCount(0);
	await page.reload();
	await unlock(page, phone);
	await expect(
		page.getByRole('button', { name: 'Resume saved Lomi review', exact: true })
	).toHaveCount(0);
});
