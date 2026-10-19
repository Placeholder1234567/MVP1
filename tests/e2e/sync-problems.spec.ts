import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

// Changes the server refuses (offline-sync.md §6 "Permanently Failed
// Writes"): the person reviews them, tries one again or discards it, and
// one-time sync messages are dismissed once read. The refusal is faked at
// sync.upload, so no real record has to break a rule.
test('a refused change can be retried or discarded', async ({ page }, info) => {
	test.skip(info.project.name !== 'desktop', 'One run is enough for the sync banner.');
	test.setTimeout(180000);
	page.on('dialog', (d) => d.accept());
	let refuse = true;
	let accepted = 0;
	await page.route(/\/api\/trpc\/sync\.upload(?:\?|$)/, async (route) => {
		if (!refuse) {
			const response = await route.fetch();
			await route.fulfill({ response });
			accepted++;
			return;
		}
		const ops = (route.request().postDataJSON()?.['0']?.json?.ops ?? []) as Array<{
			id: string;
			table: string;
		}>;
		await route.fulfill({
			json: [
				{
					result: {
						data: {
							json: {
								applied: [],
								rejected: ops.map((o) => ({
									id: o.id,
									table: o.table,
									code: 'RULE_VIOLATION',
									message: 'Synthetic refusal for this test'
								})),
								notices: [
									{
										id: ops[0]?.id,
										table: 'messages',
										code: 'MAR_CONFLICT',
										message: 'Synthetic sync notice'
									}
								]
							}
						}
					}
				}
			]
		});
	});

	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('cara@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Oak House' });

	const post = async (text: string) => {
		await page.getByRole('link', { name: /^Team messages/ }).click();
		await page.getByLabel('Message your team', { exact: true }).fill(text);
		await page.getByRole('button', { name: 'Save message', exact: true }).click();
	};
	const banner = page.getByTestId('failed-writes');

	// Refused, with a one-time message alongside.
	const kept = `Synthetic retry ${Date.now()}`;
	await post(kept);
	await expect(banner).toContainText('1 change could not be saved.');
	const notice = page.getByTestId('sync-notice');
	await expect(notice).toHaveText(/Synthetic sync notice/);
	await notice.getByRole('button', { name: 'OK', exact: true }).click();
	await expect(notice).toHaveCount(0);
	await banner.getByRole('button', { name: 'Review', exact: true }).click();
	await expect(banner).toContainText('Board message');
	await expect(banner).toContainText('Synthetic refusal for this test');
	expect(
		(await new AxeBuilder({ page }).include('[data-testid="failed-writes"]').analyze()).violations
	).toEqual([]);

	// The server accepts it now: trying again saves it. The refused message
	// leaves the device once it catches up with the server; before that the
	// app asks to wait.
	refuse = false;
	const board = page.getByTestId('board');
	await expect(board.locator('article', { hasText: kept })).toHaveCount(0, { timeout: 90000 });
	await banner.getByRole('button', { name: 'Try again', exact: true }).click();
	// The last refused change is queued again, so the banner goes.
	await expect(banner).toHaveCount(0);
	await expect.poll(() => accepted).toBeGreaterThan(0);
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	await expect(page.getByTestId('board').locator('article', { hasText: kept })).toBeVisible();

	// Discarded instead: it leaves the list and never reaches the server.
	refuse = true;
	await post(`Synthetic discard ${Date.now()}`);
	await expect(banner).toContainText('1 change could not be saved.');
	await banner.getByRole('button', { name: 'Review', exact: true }).click();
	await banner.getByRole('button', { name: 'Discard', exact: true }).click();
	await expect(banner).toHaveCount(0);
	await page.getByTestId('sync-notice').getByRole('button', { name: 'OK', exact: true }).click();
});
