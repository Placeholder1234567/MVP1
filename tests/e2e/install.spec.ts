import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';

// Install prompts (frontend-spec-2.md §8.4). Chromium only fires
// beforeinstallprompt for a real installable origin, so the test sends a
// stand-in event and records what the app does with it.
const PIN = '246810';

async function offerInstall(page: Page, outcome: 'accepted' | 'dismissed') {
	await page.evaluate((outcome) => {
		const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
			prompt(): Promise<void>;
			userChoice: Promise<{ outcome: string }>;
		};
		(window as unknown as { prompted: number }).prompted = 0;
		event.prompt = async () => {
			(window as unknown as { prompted: number }).prompted++;
		};
		event.userChoice = Promise.resolve({ outcome });
		dispatchEvent(event);
	}, outcome);
}

async function reopen(page: Page) {
	await page.reload();
	await page.getByLabel('Device PIN', { exact: true }).fill(PIN);
	await page.getByRole('button', { name: 'Unlock', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await expect(page.getByRole('heading', { level: 1, name: /^Hello,/ })).toBeVisible();
}

test('install banner waits for a second visit, can be dismissed, and stops after install', async ({
	page
}, info) => {
	test.skip(info.project.name !== 'phone', 'The install banner is for touch devices.');
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('lena@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill(PIN);
	await page.getByLabel('Confirm PIN', { exact: true }).fill(PIN);
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByRole('heading', { level: 1, name: /^Hello,/ })).toBeVisible();
	const banner = page.getByRole('region', { name: 'Install Guad' });

	// First visit: no banner even when the browser offers install.
	await offerInstall(page, 'dismissed');
	await expect(page.getByRole('heading', { level: 1, name: /^Hello,/ })).toBeVisible();
	await expect(banner).toBeHidden();

	// Second visit: offered; "Not now" hides it for the rest of the session.
	await reopen(page);
	await offerInstall(page, 'dismissed');
	await expect(banner).toBeVisible();
	const axe = await new AxeBuilder({ page }).include('[aria-label="Install Guad"]').analyze();
	expect(axe.violations).toEqual([]);
	await page.screenshot({ path: info.outputPath('banner.png') });
	await banner.getByRole('button', { name: 'Not now', exact: true }).click();
	await expect(banner).toBeHidden();

	// Third visit: offered again; installing ends it for good.
	await reopen(page);
	await offerInstall(page, 'accepted');
	await banner.getByRole('button', { name: 'Add to home screen', exact: true }).click();
	await expect(banner).toBeHidden();
	expect(await page.evaluate(() => (window as unknown as { prompted: number }).prompted)).toBe(1);

	await reopen(page);
	await offerInstall(page, 'dismissed');
	await expect(page.getByRole('heading', { level: 1, name: /^Hello,/ })).toBeVisible();
	await expect(banner).toBeHidden();
});

const IPHONE_SAFARI =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

test.describe('without an install prompt API', () => {
	test.use({ userAgent: IPHONE_SAFARI });

	test('iPhone Safari gets instructions from the third visit until "Got it"; the installed app welcomes once', async ({
		page,
		context
	}, info) => {
		test.skip(info.project.name !== 'phone', 'Instructions are for iPhone and iPad.');
		await page.goto('/login');
		await page.getByLabel('Email', { exact: true }).fill('dev@guad.test');
		await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
		await page.getByRole('button', { name: 'Sign in', exact: true }).click();
		await page.getByLabel('Device PIN', { exact: true }).fill(PIN);
		await page.getByLabel('Confirm PIN', { exact: true }).fill(PIN);
		await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
		await expect(page.getByRole('heading', { level: 1, name: /^Hello,/ })).toBeVisible();
		const sheet = page.getByRole('dialog', { name: 'Add Guad to your home screen' });
		await reopen(page);
		await expect(sheet).toBeHidden();

		await reopen(page);
		await expect(sheet).toBeVisible();
		await expect(sheet.getByRole('button', { name: 'Got it', exact: true })).toBeFocused();
		await page.screenshot({ path: info.outputPath('ios-sheet.png') });
		await sheet.getByRole('button', { name: 'Got it', exact: true }).click();
		await expect(sheet).toBeHidden();
		await reopen(page);
		await expect(sheet).toBeHidden();

		// Opened from the home screen, iOS sets navigator.standalone: a one-time welcome.
		// (Chromium can't emulate display-mode: standalone.)
		await context.addInitScript(() =>
			Object.defineProperty(navigator, 'standalone', { value: true })
		);
		const welcome = page.getByRole('dialog', { name: 'Welcome to Guad' });
		await reopen(page);
		await expect(welcome).toBeVisible();
		await page.screenshot({ path: info.outputPath('welcome.png') });
		await welcome.getByRole('button', { name: 'Get started', exact: true }).click();
		await expect(welcome).toBeHidden();
		await reopen(page);
		await expect(welcome).toBeHidden();
	});
});
