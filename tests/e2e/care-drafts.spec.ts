import { test, expect, type Page, type BrowserContext } from '@playwright/test';

async function unlock(page: Page, fresh = false, button = 'Unlock') {
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	if (fresh) await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page
		.getByRole('button', { name: fresh ? 'Save PIN and open' : button, exact: true })
		.click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
}
async function signIn(page: Page) {
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('supervisor@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Make this device yours' })).toBeVisible();
	await unlock(page, true);
	await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Oak House' });
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
}
async function openPerson(page: Page, name: string) {
	await page.getByRole('link', { name: 'Overview', exact: true }).first().click();
	await page.getByRole('link', { name: 'Care records', exact: true }).first().click();
	await page.getByRole('link', { name: new RegExp(name) }).click();
}
async function restart(page: Page, context: BrowserContext) {
	const url = page.url();
	// Close the tab after the explicit durable-save notice, then reopen the same encrypted profile.
	await page.close();
	const next = await context.newPage();
	await next.goto(url);
	await unlock(next);
	return next;
}
async function discard(page: Page) {
	const dialog = page.waitForEvent('dialog').then((d) => d.accept());
	await page.getByRole('button', { name: 'Discard unfinished form', exact: true }).click();
	await dialog;
	await expect(
		page.getByRole('button', { name: 'Discard unfinished form', exact: true })
	).toBeHidden();
}

test('health, incident and attendance drafts recover from encrypted storage without restoring a signature', async ({
	page,
	context
}, info) => {
	test.setTimeout(240000);
	const person = info.project.name === 'phone' ? 'Rosa Demo' : 'Marcus Demo';
	await signIn(page);
	await openPerson(page, person);
	await page.getByRole('link', { name: /^Health Vitals/ }).click();
	await page.getByLabel('Pulse', { exact: true }).fill('81');
	await page.getByRole('button', { name: 'Lock device', exact: true }).first().click();
	await unlock(page, false, 'Unlock workspace');
	await expect(page.getByLabel('Pulse', { exact: true })).toHaveValue('81');
	await expect(
		page.getByText('Recovery draft saved on this device. Check saved records before submitting.', {
			exact: true
		})
	).toBeVisible();
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	page = await restart(page, context);
	await expect(
		page.getByRole('region', { name: 'Recover unfinished care form', exact: true })
	).toBeVisible();
	await expect(page.getByLabel('Pulse', { exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Resume unfinished form', exact: true }).click();
	await expect(page.getByLabel('Pulse', { exact: true })).toHaveValue('81');
	await expect(page.getByText(/Recovered unfinished observations/)).toBeVisible();
	await discard(page);
	await expect(page.getByLabel('Pulse', { exact: true })).toHaveValue('');
	page = await restart(page, context);
	await expect(
		page.getByRole('button', { name: 'Resume unfinished form', exact: true })
	).toHaveCount(0);
	await openPerson(page, person);
	await page.getByRole('link', { name: /^Report an incident/ }).click();
	await page
		.getByRole('group', { name: 'What kind of incident?', exact: true })
		.getByRole('button', { name: 'Other', exact: true })
		.click();
	const description = `Synthetic ${info.project.name} unfinished recovery exercise.`;
	await page.getByLabel('What happened', { exact: true }).fill(description);
	await page.getByRole('button', { name: 'Next', exact: true }).click();
	await page
		.getByLabel('What you did', { exact: true })
		.fill('Synthetic unsent observations only.');
	await page.getByRole('button', { name: 'Next', exact: true }).click();
	await page
		.getByRole('checkbox', {
			name: 'I, Sam Supervisor, confirm this report is accurate.',
			exact: true
		})
		.check();
	await expect(
		page.getByText('Recovery draft saved on this device. Check saved records before submitting.', {
			exact: true
		})
	).toBeVisible();
	page = await restart(page, context);
	await page.getByRole('button', { name: 'Resume unfinished form', exact: true }).click();
	await expect(
		page.getByRole('checkbox', {
			name: 'I, Sam Supervisor, confirm this report is accurate.',
			exact: true
		})
	).not.toBeChecked();
	await expect(
		page.getByRole('button', { name: 'Sign and submit report', exact: true })
	).toBeDisabled();
	await page.getByRole('button', { name: 'Back', exact: true }).click();
	await page.getByRole('button', { name: 'Back', exact: true }).click();
	await expect(page.getByLabel('What happened', { exact: true })).toHaveValue(description);
	await discard(page);
	await openPerson(page, person);
	await page.getByRole('link', { name: /^Attendance/ }).click();
	// Previous care workflow tests may have already recorded services; choose a still-editable one.
	const available = page.locator('input[type="checkbox"]:enabled').first();
	await expect(available).toBeVisible();
	const selected = await available.locator('..').innerText();
	await available.check();
	await expect(
		page.getByText('Recovery draft saved on this device. Check saved records before submitting.', {
			exact: true
		})
	).toBeVisible();
	page = await restart(page, context);
	await page.getByRole('button', { name: 'Resume unfinished form', exact: true }).click();
	await expect(page.getByRole('checkbox', { name: selected.trim(), exact: true })).toBeChecked();
	await expect(page.getByRole('checkbox', { name: selected.trim(), exact: true })).toBeEnabled();
	const proof = info.outputPath('encrypted-care-draft-recovery.png');
	await page.screenshot({ path: proof, fullPage: true });
	await info.attach('Encrypted unfinished form recovered', {
		path: proof,
		contentType: 'image/png'
	});
	await discard(page);
});
