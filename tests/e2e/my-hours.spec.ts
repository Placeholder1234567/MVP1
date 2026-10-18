import { test, expect, type Page } from '@playwright/test';

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

test('a caregiver sees a missed punch their supervisor added, with the reason', async ({
	page,
	browser
}, info) => {
	test.setTimeout(180000);
	await signIn(page, 'supervisor@guad.test');
	await page.getByRole('link', { name: 'Timesheets', exact: true }).first().click();

	// A ten-minute entry two hours ago (twenty for the phone run), so runs on
	// the same database never overlap and it is Cara's most recent record.
	const slot = 10 * 60000;
	const start =
		Math.floor(Date.now() / slot) * slot -
		2 * 3600000 -
		(info.project.name === 'phone' ? 2 * slot : 0);
	const local = (ms: number) =>
		page.evaluate((t) => {
			const d = new Date(t);
			const pad = (n: number) => String(n).padStart(2, '0');
			return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
		}, ms);
	const reason = `Badge reader was down (${info.project.name})`;
	const form = page.locator('form').filter({ hasText: 'Correct a missed punch' });
	await form.getByRole('combobox', { name: /^Staff member/ }).selectOption({ label: 'Cara Giver' });
	await form.getByLabel('Clock-in', { exact: true }).fill(await local(start));
	await form.getByLabel('Clock-out', { exact: true }).fill(await local(start + slot));
	await form.getByRole('textbox', { name: /^Reason/ }).fill(reason);
	await form.getByRole('button', { name: 'Add manual entry for review', exact: true }).click();
	await expect(form.getByRole('textbox', { name: /^Reason/ })).toHaveValue('');

	const caregiver = await browser.newContext({ viewport: page.viewportSize() });
	try {
		const cara = await caregiver.newPage();
		await signIn(cara, 'cara@guad.test');
		await cara.getByRole('link', { name: 'Me', exact: true }).first().click();
		const hours = cara.getByRole('region', { name: 'My hours', exact: true });
		await expect(hours.getByText('This week')).toBeVisible();
		const entry = hours
			.getByRole('list', { name: 'Recent clock records', exact: true })
			.getByRole('listitem')
			.filter({ hasText: reason });
		await expect(entry).toContainText('Added by your supervisor');
		await expect(entry).toContainText('10m');
	} finally {
		await caregiver.close();
	}
});
