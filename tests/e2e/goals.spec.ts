import { test, expect } from '@playwright/test';

test('supervisor uses an agency template, edits/stops a goal and keeps offline draft entries', async ({
	page,
	context
}, info) => {
	test.setTimeout(180000);
	const person = info.project.name === 'phone' ? 'Rosa Demo' : 'Marcus Demo';
	const title = `Synthetic ${info.project.name} goal: choose an activity`;
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('supervisor@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Make this device yours' })).toBeVisible();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	const unlock = page.getByRole('button', { name: 'Save PIN and open', exact: true });
	await unlock.click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Oak House' });
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	await page.getByRole('link', { name: 'Overview', exact: true }).first().click();
	await page.getByRole('link', { name: 'Timesheets', exact: true }).first().click();
	await page.getByRole('link', { name: 'Care record reports →', exact: true }).click();
	await page.getByRole('link', { name: 'Manage goals and templates →', exact: true }).click();
	await page
		.getByRole('combobox', { name: 'Goal home', exact: true })
		.selectOption({ label: 'Oak House' });
	await page
		.getByRole('combobox', { name: 'Goal person', exact: true })
		.selectOption({ label: person });
	const editor = page.getByRole('form', { name: 'Goal editor', exact: true });
	await expect(editor).toBeVisible();
	const templateForm = page.getByRole('form', { name: 'New agency template', exact: true });
	await templateForm
		.getByLabel('Template area', { exact: true })
		.fill(`Browser ${info.project.name}`);
	await templateForm.getByLabel('Template wording', { exact: true }).fill(title);
	await templateForm
		.getByLabel('Template steps, one per line', { exact: true })
		.fill('Offer two choices\nRecord the selected activity');
	await templateForm.getByRole('button', { name: 'Save agency template', exact: true }).click();
	await expect(page.getByText('Agency template saved.', { exact: true })).toBeVisible();
	const template = page
		.getByRole('article', { name: 'Goal template', exact: true })
		.filter({ hasText: title });
	await expect(template).toContainText('Agency template');
	await template
		.getByRole('button', { name: 'Use template for selected person', exact: true })
		.click();
	await expect(editor.getByLabel('Goal wording', { exact: true })).toHaveValue(title);
	await expect(
		page.getByRole('article', { name: 'Active goal', exact: true }).filter({ hasText: title })
	).toHaveCount(0);
	await editor.getByLabel('How often', { exact: true }).fill('One observed opportunity each shift');
	await editor
		.getByLabel('Goal target', { exact: true })
		.fill('Document actual support without inference');
	await editor.getByRole('button', { name: 'Create goal', exact: true }).click();
	await expect(
		page.getByText('Goal saved. Care records receive the change after sync.', { exact: true })
	).toBeVisible();
	let active = page
		.getByRole('article', { name: 'Active goal', exact: true })
		.filter({ hasText: title });
	await active.getByRole('button', { name: 'Edit goal', exact: true }).click();
	const changed = `${title}, with a preferred choice`;
	await editor.getByLabel('Goal wording', { exact: true }).fill(changed);
	await editor.getByRole('button', { name: 'Save goal changes', exact: true }).click();
	active = page
		.getByRole('article', { name: 'Active goal', exact: true })
		.filter({ hasText: changed });
	await expect(active).toBeVisible();
	const cancelStop = page.waitForEvent('dialog').then((d) => d.dismiss());
	await active.getByRole('button', { name: 'Stop goal', exact: true }).click();
	await cancelStop;
	await expect(active).toBeVisible();
	const confirmStop = page.waitForEvent('dialog').then((d) => d.accept());
	await active.getByRole('button', { name: 'Stop goal', exact: true }).click();
	await confirmStop;
	await expect(
		page.getByText('Goal stopped. Its history is preserved.', { exact: true })
	).toBeVisible();
	await expect(active).toHaveCount(0);
	await page.getByText(/^Stopped goals \(/).click();
	const stopped = page
		.getByRole('article', { name: 'Stopped goal', exact: true })
		.filter({ hasText: changed });
	await expect(stopped).toBeVisible();
	await expect(stopped.getByRole('button')).toHaveCount(0);
	await expect(stopped).toContainText('recorded trials remain in history');
	await context.setOffline(true);
	await expect(
		page.getByText('Reconnect to manage goals and templates.', { exact: false })
	).toBeVisible();
	await editor.getByLabel('Goal area', { exact: true }).fill('Offline draft');
	await editor
		.getByLabel('Goal wording', { exact: true })
		.fill('Synthetic unsaved observations remain here.');
	await editor.getByRole('button', { name: 'Create goal', exact: true }).click();
	await expect(
		page.getByText('Reconnect to save this goal. Your draft entries are kept.', { exact: true })
	).toBeVisible();
	await expect(editor.getByLabel('Goal wording', { exact: true })).toHaveValue(
		'Synthetic unsaved observations remain here.'
	);
	await context.setOffline(false);
	const stayOnPage = page.waitForEvent('dialog').then((d) => d.dismiss());
	await page.getByRole('link', { name: 'Overview', exact: true }).first().click();
	await stayOnPage;
	await expect(
		page.getByRole('heading', { name: 'Goals that guide support.', exact: true })
	).toBeVisible();
	await expect(editor.getByLabel('Goal wording', { exact: true })).toHaveValue(
		'Synthetic unsaved observations remain here.'
	);
	const discardDraft = page.waitForEvent('dialog').then((d) => d.accept());
	await editor.getByRole('button', { name: 'Cancel goal changes', exact: true }).click();
	await discardDraft;
	await expect(editor.getByLabel('Goal wording', { exact: true })).toHaveValue('');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
	const path = info.outputPath('goals-and-preserved-history.png');
	await page.screenshot({ path, fullPage: true });
	await info.attach('goals-and-preserved-history', { path, contentType: 'image/png' });
	// A clean hard reload remounts before local sync necessarily chooses its first home.
	await page.reload();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	const reopen = page.getByRole('button', { name: 'Unlock', exact: true });
	await reopen.click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await expect(page.getByRole('combobox', { name: 'Goal home', exact: true })).not.toHaveValue('');
	const personOptions = page
		.getByRole('combobox', { name: 'Goal person', exact: true })
		.locator('option');
	await expect.poll(() => personOptions.count()).toBeGreaterThan(1);
	await expect(page.getByRole('combobox', { name: 'Goal person', exact: true })).toContainText(
		/Marcus Demo|Rosa Demo|Theo Demo/
	);
});
