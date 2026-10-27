// Clock in and out (frontend-spec-2 §3.8): a punch inside Oak House's
// geofence is verified; one from outside is kept, marked for review, and the
// supervisor acknowledges it on Timesheets. Synthetic demo staff only.
import { test, expect, type Page } from '@playwright/test';

// Oak House (seed.ts) and a point about 1.1 km north of it, outside its radius.
const OAK = { latitude: 39.9526, longitude: -75.1652, accuracy: 10 };
const AWAY = { latitude: 39.9626, longitude: -75.1652, accuracy: 10 };

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

test('clock-ins inside the geofence are verified; outside ones are kept for supervisor review', async ({
	browser,
	page
}) => {
	test.setTimeout(180000);
	const caregiver = await browser.newContext({
		viewport: page.viewportSize(),
		permissions: ['geolocation'],
		geolocation: OAK
	});
	try {
		const cara = await caregiver.newPage();
		await signIn(cara, 'cara@guad.test');
		await cara.getByRole('link', { name: 'Today', exact: true }).first().click();
		const status = cara.getByRole('status').filter({ hasText: /Clock/ });
		const clockOut = async () => {
			await cara.getByRole('button', { name: 'Clock out', exact: true }).click();
			await expect(status).toHaveText('Clock-out saved on this device.');
			await expect(cara.getByText('Ready for your shift?', { exact: true })).toBeVisible();
			await expect(cara.getByTestId('sync-status')).toHaveText('All changes synced');
		};
		// A run that stopped partway may have left Cara clocked in.
		await expect(
			cara.getByText(/^(Ready for your shift\?|You’re clocked in)$/).first()
		).toBeVisible();
		if (await cara.getByRole('button', { name: 'Clock out', exact: true }).isVisible())
			await clockOut();

		await cara.getByRole('button', { name: 'Clock in with location', exact: true }).click();
		await expect(status).toHaveText('Clocked in. Location verified.');
		await expect(cara.getByText('Oak House · Location verified', { exact: true })).toBeVisible();
		await expect(cara.getByTestId('sync-status')).toHaveText('All changes synced');
		await clockOut();

		await caregiver.setGeolocation(AWAY);
		// The clock-out above reaches the server through sync, which can lag
		// the status badge by a moment; until it lands the server still has
		// Cara clocked in, so tap again as a person would.
		await expect(async () => {
			await cara.getByRole('button', { name: 'Clock in with location', exact: true }).click();
			await expect(status).toHaveText('Clocked in. Your supervisor will review the location.', {
				timeout: 3000
			});
		}).toPass({ timeout: 30000 });
		await expect(
			cara.getByText('Oak House · Location needs review', { exact: true })
		).toBeVisible();
		await expect(cara.getByTestId('sync-status')).toHaveText('All changes synced');

		// The supervisor sees the open, unverified punch and acknowledges it.
		await signIn(page, 'supervisor@guad.test');
		await page.getByRole('link', { name: 'Timesheets', exact: true }).first().click();
		await page.getByRole('button', { name: 'Load timesheet', exact: true }).click();
		const entry = page
			.getByRole('article')
			.filter({ hasText: 'Cara Giver' })
			.filter({ hasText: 'Still clocked in' });
		await expect(entry).toHaveCount(1);
		await expect(entry.getByText('Needs review', { exact: true })).toBeVisible();
		await entry.getByRole('button', { name: 'Acknowledge reviewed entry', exact: true }).click();
		await expect(entry.getByText('Acknowledged', { exact: true })).toBeVisible();
		await expect(
			entry.getByRole('button', { name: 'Acknowledge reviewed entry', exact: true })
		).toBeHidden();

		await clockOut();
	} finally {
		await caregiver.close();
	}
});
