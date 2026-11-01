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

	// A ten-minute entry two hours ago (three for the phone run). Each run
	// takes its slot from its own start time and the phone run starts later,
	// so the gap must be longer than the time between them: 20 minutes was
	// not (a run 20-30 minutes later landed on the desktop entry, and the
	// server rightly refused the overlapping missed punch).
	const slot = 10 * 60000;
	const start =
		Math.floor(Date.now() / slot) * slot -
		2 * 3600000 -
		(info.project.name === 'phone' ? 3600000 : 0);
	// The form takes times in the agency's time zone (the demo agency is
	// America/New_York), whatever the browser's is.
	const local = (ms: number) => {
		const parts = Object.fromEntries(
			new Intl.DateTimeFormat('en-US', {
				timeZone: 'America/New_York',
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
				hourCycle: 'h23'
			})
				.formatToParts(new Date(ms))
				.map((p) => [p.type, p.value])
		);
		return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
	};
	const reason = `Badge reader was down (${info.project.name})`;
	const form = page.locator('form').filter({ hasText: 'Correct a missed punch' });
	await form.getByRole('combobox', { name: /^Staff member/ }).selectOption({ label: 'Cara Giver' });
	await form.getByLabel('Clock-in', { exact: true }).fill(local(start));
	await form.getByLabel('Clock-out', { exact: true }).fill(local(start + slot));
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
