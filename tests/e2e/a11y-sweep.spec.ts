import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';

// Every screen, checked with axe against WCAG 2.1 A and AA (frontend-spec-1
// §9), and timed against the load budget (frontend-spec-3 §11). Each signed-in
// screen is opened by URL after the device has synced, as a returning user would.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
/** Time from navigation to the main heading showing, on a synced device. */
const SCREEN_BUDGET_MS = 3000;

async function signIn(page: Page, email: string) {
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill(email);
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Oak House' });
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
}

/** Opens a screen without a full reload (the PIN only unlocks the open tab). */
async function open(page: Page, path: string) {
	const started = Date.now();
	await page.evaluate((to) => {
		const a = document.createElement('a');
		a.href = to;
		document.body.append(a);
		a.click();
		a.remove();
	}, path);
	await page.waitForURL((url) => url.pathname === path);
	await expect(page.locator('main h1').first()).toBeVisible();
	return Date.now() - started;
}

async function check(page: Page, path: string, timings: Record<string, number>) {
	timings[path] = await open(page, path);
	// Let skeletons and transitions settle so axe sees the finished screen
	// (some screens keep a live connection open, so the network never goes idle).
	await page.waitForTimeout(600);
	const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
	expect
		.soft(
			result.violations.map((v) => ({ path, id: v.id, nodes: v.nodes.map((n) => n.target) })),
			path
		)
		.toEqual([]);
}

test('public screens pass axe', async ({ page }) => {
	for (const path of ['/login', '/offline']) {
		await page.goto(path);
		await expect(page.locator('h1').first()).toBeVisible();
		const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
		expect(
			result.violations.map((v) => ({ path, id: v.id })),
			path
		).toEqual([]);
	}
});

test('every caregiver screen passes axe and loads within budget', async ({ page }, info) => {
	test.setTimeout(300000);
	await signIn(page, 'cara@guad.test');
	const timings: Record<string, number> = {};
	for (const path of ['/today', '/shifts', '/notes', '/messages', '/notifications', '/me'])
		await check(page, path, timings);
	await check(page, '/me/notifications', timings);

	await open(page, '/today');
	await page
		.getByRole('link', { name: /Rosa Demo/ })
		.first()
		.click();
	await page.waitForURL(/\/people\/[0-9a-f-]{36}$/);
	const person = new URL(page.url()).pathname;
	for (const sub of [
		'',
		'/summary',
		'/note',
		'/medications',
		'/health',
		'/behavior',
		'/attendance',
		'/incident'
	])
		await check(page, person + sub, timings);
	await info.attach('timings', { body: JSON.stringify(timings, null, 2) });
	for (const [path, ms] of Object.entries(timings))
		expect.soft(ms, `${path} took ${ms} ms`).toBeLessThan(SCREEN_BUDGET_MS);
});

test('every office screen passes axe and loads within budget', async ({ page }, info) => {
	test.setTimeout(300000);
	await signIn(page, 'admin@guad.test');
	// An open medication-error report puts a Critical band on the overview,
	// so its colors are checked too.
	await open(page, '/dashboard/people');
	await page
		.getByRole('link', { name: /Rosa Demo/ })
		.first()
		.click();
	await page.waitForURL(/\/dashboard\/people\/[0-9a-f-]{36}$/);
	const rosa = new URL(page.url()).pathname.split('/').pop()!;
	await open(page, `/people/${rosa}/incident`);
	await page
		.getByRole('group', { name: 'What kind of incident?', exact: true })
		.getByRole('button', { name: 'Medication error', exact: true })
		.click();
	await page
		.getByLabel('What happened', { exact: true })
		.fill(`Synthetic ${info.project.name} sweep report; no actual incident.`);
	await page.getByRole('button', { name: 'Next', exact: true }).click();
	await page
		.getByLabel('What you did', { exact: true })
		.fill('Recorded for interface verification.');
	await page.getByRole('button', { name: 'Next', exact: true }).click();
	await page.getByRole('checkbox', { name: /confirm this report is accurate/ }).check();
	await page.getByRole('button', { name: 'Sign and submit report', exact: true }).click();
	await expect(page.getByRole('heading', { name: /Incident report submitted/i })).toBeVisible();
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');

	const timings: Record<string, number> = {};
	for (const path of [
		'/dashboard',
		'/dashboard/notes',
		'/dashboard/people',
		'/dashboard/staff',
		'/dashboard/mar',
		'/dashboard/medications',
		'/dashboard/goals',
		'/dashboard/analytics',
		'/dashboard/timesheets',
		'/dashboard/reports',
		'/dashboard/intake',
		'/dashboard/imports',
		'/dashboard/audit',
		'/dashboard/api-keys',
		'/dashboard/setup',
		'/controlled'
	])
		await check(page, path, timings);

	await open(page, '/dashboard/people');
	await page
		.getByRole('link', { name: /Rosa Demo/ })
		.first()
		.click();
	await page.waitForURL(/\/dashboard\/people\/[0-9a-f-]{36}$/);
	await check(page, new URL(page.url()).pathname, timings);
	await info.attach('timings', { body: JSON.stringify(timings, null, 2) });
	for (const [path, ms] of Object.entries(timings))
		expect.soft(ms, `${path} took ${ms} ms`).toBeLessThan(SCREEN_BUDGET_MS);
});
