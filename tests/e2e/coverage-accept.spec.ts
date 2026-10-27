// Coverage end to end (frontend-spec-3 §4.3, US-21): a supervisor asks for
// cover on an open shift, an eligible caregiver sees the offer on her own
// device and takes it, and the supervisor's schedule shows who filled it.
// Synthetic demo staff only.
import { test, expect, type Page } from '@playwright/test';

test.use({ actionTimeout: 30000 });

const signIn = async (tab: Page, email: string) => {
	await tab.goto('/login');
	await tab.getByLabel('Email', { exact: true }).fill(email);
	await tab.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await tab.getByRole('button', { name: 'Sign in', exact: true }).click();
	await tab.getByLabel('Device PIN', { exact: true }).fill('654321');
	const confirm = tab.getByLabel('Confirm PIN', { exact: true });
	if (await confirm.isVisible()) await confirm.fill('654321');
	await tab.getByRole('button', { name: /^(Save PIN and open|Unlock)$/ }).click();
	await expect(tab.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await tab.getByLabel('Current home', { exact: true }).selectOption({ label: 'Oak House' });
	await expect(tab.getByTestId('sync-status')).toHaveText('All changes synced');
};

test('a caregiver takes a shift offer and the supervisor sees it filled', async ({
	browser,
	page
}, info) => {
	test.setTimeout(180000);
	await signIn(page, 'supervisor@guad.test');
	await page.getByRole('link', { name: 'Schedule', exact: true }).first().click();
	// Six weeks out, one day per viewport: clear of coverage-export's weeks.
	for (let i = 0; i < 6; i++) {
		const oldWeek = await page.getByText(/^Week of /).innerText();
		await page.getByRole('button', { name: 'Next week →', exact: true }).click();
		await expect(page.getByText(/^Week of /)).not.toHaveText(oldWeek);
	}
	const week = (await page.getByText(/^Week of /).innerText()).replace('Week of ', '').trim();
	const date = new Date(`${week}T12:00:00Z`);
	date.setUTCDate(date.getUTCDate() + (info.project.name === 'phone' ? 2 : 1));
	const day = date.toISOString().slice(0, 10);
	const assignment = page.getByRole('combobox', { name: `${day} Evening assignment`, exact: true });
	const original = await assignment.inputValue();
	if (original) await assignment.selectOption('');
	await expect(assignment).toHaveValue('');
	const shift = assignment.locator('..').locator('..');
	await shift.getByRole('button', { name: 'Find cover with Lomi', exact: true }).click();
	const recorded = page
		.getByRole('region', { name: 'Coverage activity', exact: true })
		.getByRole('article')
		.filter({ hasText: `${day} · Evening` });
	await expect(recorded.first()).toContainText('Coverage requested');

	const caregiver = await browser.newContext({ viewport: page.viewportSize() });
	try {
		const cara = await caregiver.newPage();
		await signIn(cara, 'cara@guad.test');
		const offers = cara.getByRole('region', { name: 'Shift offers', exact: true });
		const offer = offers.locator('.callout').filter({ hasText: `Oak House · ${day} · PM` });
		await expect(offer).toBeVisible();
		await offer.getByRole('button', { name: 'I’ll take it', exact: true }).click();
		await expect(offers.getByRole('status')).toHaveText('You’ve picked up the shift. Thank you.');
		await expect(offer).toBeHidden();
	} finally {
		await caregiver.close();
	}

	await expect(recorded.first()).toContainText('Filled by Cara Giver', { timeout: 60000 });
	await expect(assignment.locator('option:checked')).toHaveText(/^Cara Giver/, {
		timeout: 60000
	});
	// Put the shift back as it was.
	await assignment.selectOption(original);
	await expect(assignment).toHaveValue(original);
});
