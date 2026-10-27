import { test, expect } from '@playwright/test';

// Lists over 25 rows show the first 25 and a "Load more" button
// (frontend-spec-3.md §5 Pagination), never infinite scroll.
test('long lists show 25 rows and load more on request', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop', 'One run is enough for a list control.');
	// Stretch the staff list to 30 synthetic rows. tRPC may batch it with
	// the page's other queries, so find its place in the batch.
	await page.route(/\/api\/trpc\/[^?]*\bstaff\.list\b/, async (route) => {
		const procedures = decodeURIComponent(new URL(route.request().url()).pathname)
			.split('/')
			.pop()!
			.split(',');
		const at = procedures.indexOf('staff.list');
		const response = await route.fetch();
		const body = await response.json();
		const rows = body[at].result.data.json as Array<Record<string, unknown>>;
		const extra = Array.from({ length: 30 - rows.length }, (_, i) => ({
			...rows[0],
			id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
			name: `Synthetic Staff ${String(i + 1).padStart(2, '0')}`,
			email: `synthetic-${i}@example.test`
		}));
		body[at].result.data.json = [...rows, ...extra];
		await route.fulfill({ response, json: body });
	});
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('admin@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await page.getByRole('link', { name: 'Staff', exact: true }).first().click();

	await expect(page.getByText('Showing 25 of 30', { exact: true })).toBeVisible();
	const more = page.getByRole('button', { name: 'Load more', exact: true });
	await more.click();
	await expect(more).toBeHidden();
	await expect(page.getByText(/^Showing \d+ of \d+$/)).toBeHidden();
});
