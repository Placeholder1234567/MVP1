import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';

// Night mode and the evening dark-mode suggestion (frontend-spec-1.md §10.1,
// §10.5). The demo agency is in America/New_York.
async function signIn(page: Page, email: string) {
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill(email);
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
}

/** The most recent 9:30pm in New York, so sign-in tokens still look fresh. */
function lastEvening(): Date {
	const now = new Date();
	for (let back = 0; back < 48 * 60; back += 15) {
		const at = new Date(now.getTime() - back * 60_000);
		const hm = new Intl.DateTimeFormat('en-US', {
			timeZone: 'America/New_York',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		}).format(at);
		if (hm >= '21:30' && hm < '21:45') return at;
	}
	throw new Error('no evening found');
}

test('night mode dims the page and passes axe; Auto suggests dark mode in the evening', async ({
	page
}, info) => {
	test.setTimeout(120000);
	await page.emulateMedia({ colorScheme: 'light' });
	await page.clock.setFixedTime(lastEvening());
	// "Not now" follows the person to every device, so each project uses its own caregiver.
	await signIn(page, info.project.name === 'phone' ? 'dev@guad.test' : 'lena@guad.test');
	const theme = page.getByRole('group', { name: 'Display theme', exact: true });
	const auto = theme.getByRole('button', { name: 'Auto', exact: true });
	// A failed earlier run may have left Night on; start from Auto.
	if ((await auto.getAttribute('aria-pressed')) !== 'true') await auto.click();
	await expect(auto).toHaveAttribute('aria-pressed', 'true');

	// 9:30pm on Auto with a light device: a suggestion, never a switch.
	const suggestion = page.getByText('Heading into evening? Switch to dark mode.', { exact: true });
	await expect(suggestion).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.dataset.theme ?? null)).toBeNull();
	await page
		.getByRole('status')
		.filter({ has: suggestion })
		.getByRole('button', { name: 'Not now', exact: true })
		.click();
	await expect(suggestion).toBeHidden();

	await theme.getByRole('button', { name: 'Night', exact: true }).click();
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
	const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
	expect(bg).toBe('rgb(10, 10, 28)');
	const axe = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(axe.violations).toEqual([]);

	// Back to Auto for other tests; the dismissal holds for today.
	await theme.getByRole('button', { name: 'Auto', exact: true }).click();
	await expect(page.locator('html')).not.toHaveAttribute('data-theme', /./);
	await page.reload();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: /^Unlock/ }).click();
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	await expect(suggestion).toBeHidden();
});
