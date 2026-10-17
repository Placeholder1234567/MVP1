import { readFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';

async function signIn(page: Page) {
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('supervisor@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Make this device yours' })).toBeVisible();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Oak House' });
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
}
async function person(page: Page, name: string) {
	await page.getByRole('link', { name: 'Care records', exact: true }).first().click();
	await page.getByRole('link', { name: new RegExp(name) }).click();
}
async function dismissReload(page: Page) {
	const dialog = page.waitForEvent('dialog').then(async (d) => {
		expect(d.type()).toBe('beforeunload');
		await d.dismiss();
	});
	await Promise.all([dialog, page.reload().catch(() => undefined)]);
}

test('button choices and changed incident facts retain draft and require a fresh signature', async ({
	page
}, info) => {
	const name = info.project.name === 'phone' ? 'Rosa Demo' : 'Marcus Demo';
	await signIn(page);
	await person(page, name);
	await page.getByRole('link', { name: /^Report an incident/ }).click();
	await page
		.getByRole('group', { name: 'What kind of incident?', exact: true })
		.getByRole('button', { name: 'Other', exact: true })
		.click();
	const reject = page.waitForEvent('dialog').then((d) => d.dismiss());
	await page.getByRole('link', { name: 'Overview', exact: true }).first().click();
	await reject;
	await expect(page.getByRole('button', { name: 'Other', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	const description = `Synthetic ${info.project.name} unsaved safeguard exercise.`;
	await page.getByLabel('What happened', { exact: true }).fill(description);
	await dismissReload(page);
	await expect(page.getByLabel('What happened', { exact: true })).toHaveValue(description);
	// A cancelled native leave must not clear the guard for the next attempt.
	await dismissReload(page);
	await expect(page.getByLabel('What happened', { exact: true })).toHaveValue(description);
	await page.getByRole('button', { name: 'Next', exact: true }).click();
	await page
		.getByLabel('What you did', { exact: true })
		.fill('Synthetic interface verification only.');
	await page.getByRole('button', { name: 'Next', exact: true }).click();
	const signature = page.getByRole('checkbox', {
		name: 'I, Sam Supervisor, confirm this report is accurate.',
		exact: true
	});
	await signature.check();
	await expect(
		page.getByRole('button', { name: 'Sign and submit report', exact: true })
	).toBeEnabled();
	await page
		.getByRole('group', { name: 'How serious was it?', exact: true })
		.getByRole('button', { name: 'Medium', exact: true })
		.click();
	await expect(signature).not.toBeChecked();
	await expect(
		page.getByRole('button', { name: 'Sign and submit report', exact: true })
	).toBeDisabled();
	const proof = info.outputPath('retained-incident-review.png');
	await page.screenshot({ path: proof, fullPage: true });
	await info.attach('Retained draft and renewed signature', {
		path: proof,
		contentType: 'image/png'
	});
	const discard = page.waitForEvent('dialog').then((d) => d.accept());
	await page.getByRole('link', { name: 'Overview', exact: true }).first().click();
	await discard;
	await expect(
		page.getByRole('heading', { name: 'A clearer picture of care.', exact: true }).first()
	).toBeVisible();
});

test('offline health and attendance updates survive reconnect and appear in care exports', async ({
	page,
	context
}, info) => {
	test.setTimeout(180000);
	const name = info.project.name === 'phone' ? 'Rosa Demo' : 'Marcus Demo';
	await signIn(page);
	await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
	await context.setOffline(true);
	await page.goto('/offline');
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Unlock saved records', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await page
		.getByRole('combobox', { name: 'Home', exact: true })
		.selectOption({ label: 'Oak House' });
	await page
		.getByRole('article')
		.filter({ has: page.getByRole('heading', { name, exact: true }) })
		.getByRole('button', { name: 'Care record', exact: true })
		.click();
	await page.getByRole('button', { name: 'Health', exact: true }).click();
	await page.getByLabel('Pulse', { exact: true }).fill(info.project.name === 'phone' ? '83' : '84');
	await page.getByRole('button', { name: 'Save vitals', exact: true }).click();
	await expect(page.getByText(/^Vitals saved for /)).toBeVisible();
	await page.getByRole('button', { name: 'Attendance', exact: true }).click();
	for (const service of ['Day program', 'Employment support']) {
		const checkbox = page.getByRole('checkbox', { name: new RegExp(`^${service}`) });
		await expect(checkbox).toBeEnabled();
		await checkbox.check();
		await page.getByRole('button', { name: 'Save attendance', exact: true }).click();
		await expect(checkbox).toBeDisabled();
		await expect(checkbox).toBeChecked();
	}
	await expect(page.getByText(/changes waiting to sync/).first()).toBeVisible();
	await context.setOffline(false);
	await page.getByRole('link', { name: 'Reconnect and sync →', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Unlock', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Oak House' });
	await page.getByRole('link', { name: 'Overview', exact: true }).first().click();
	await page.getByRole('link', { name: 'Timesheets', exact: true }).first().click();
	await page.getByRole('link', { name: 'Care record reports →', exact: true }).click();
	await page.getByRole('combobox', { name: 'Report', exact: true }).selectOption('attendance');
	await page.getByRole('combobox', { name: 'Person', exact: true }).selectOption({ label: name });
	await page.getByRole('combobox', { name: 'Format', exact: true }).selectOption('json');
	const downloaded = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download care report', exact: true }).click();
	const file = await downloaded;
	const path = info.outputPath('offline-attendance.json');
	await file.saveAs(path);
	const report = JSON.parse(await readFile(path, 'utf8'));
	expect(
		report.rows.some(
			(row: { services: string[] }) =>
				row.services.includes('Day program') && row.services.includes('Employment support')
		)
	).toBe(true);
	await page.getByRole('combobox', { name: 'Report', exact: true }).selectOption('health');
	const healthDownload = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download care report', exact: true }).click();
	const healthPath = info.outputPath('offline-health.json');
	await (await healthDownload).saveAs(healthPath);
	const health = JSON.parse(await readFile(healthPath, 'utf8'));
	expect(
		health.rows.some(
			(row: { data?: { pulse?: number } }) =>
				row.data?.pulse === (info.project.name === 'phone' ? 83 : 84)
		)
	).toBe(true);
	const proof = info.outputPath('reconnected-care-exports.png');
	await page.screenshot({ path: proof, fullPage: true });
	await info.attach('Reconnected care exports', { path: proof, contentType: 'image/png' });
});
