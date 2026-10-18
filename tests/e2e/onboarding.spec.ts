import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

// Getting started (frontend-spec-2.md §6.5) and Help on Me (frontend-audit.md
// finding 11). Dev signs in on desktop only, in no other desktop test.
const PIN = '135790';

test('a new caregiver sees getting-started steps, hides them and finds help', async ({
	page
}, info) => {
	test.skip(info.project.name !== 'desktop', 'Dev’s phone run writes notes in care.spec.ts.');
	test.setTimeout(180000);
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('dev@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill(PIN);
	await page.getByLabel('Confirm PIN', { exact: true }).fill(PIN);
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');

	const card = page.getByRole('region', { name: 'Getting started' });
	await expect(card).toBeVisible();
	await expect(card.getByRole('listitem')).toHaveCount(4);
	await expect(card.getByRole('listitem').first()).toHaveAttribute('aria-current', 'step');
	const axe = await new AxeBuilder({ page }).include('section.getting-started').analyze();
	expect(axe.violations).toEqual([]);

	await card.getByRole('button', { name: 'Hide these tips', exact: true }).click();
	await expect(card).toBeHidden();
	// Saved to user_settings: still hidden after a reload, once it has synced back.
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	await page.reload();
	await page.getByLabel('Device PIN', { exact: true }).fill(PIN);
	await page.getByRole('button', { name: 'Unlock', exact: true }).click();
	await expect(page.getByRole('heading', { level: 1, name: /^Hello,/ })).toBeVisible();
	await expect(card).toBeHidden();

	await page.getByRole('link', { name: 'Me', exact: true }).first().click();
	const help = page.getByRole('region', { name: 'Help' });
	await help.getByText('Coming from Therap? Words that mean the same thing').click();
	await expect(help.getByRole('cell', { name: 'T-Log', exact: true })).toBeVisible();
	await help.getByRole('button', { name: 'Show getting-started tips again', exact: true }).click();
	await expect(help.getByText('Getting-started tips are back on Today.')).toBeVisible();
	await page.getByRole('link', { name: 'Today', exact: true }).first().click();
	await expect(card).toBeVisible();
});
