import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

test('supervisor records scheduled and PRN wording, preserves stopped history and offline drafts', async ({
	page,
	context
}, info) => {
	test.setTimeout(180000);
	const person = info.project.name === 'phone' ? 'Rosa Demo' : 'Marcus Demo';
	const title = `Synthetic ${info.project.name} medication definition`;
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
	await page.getByRole('link', { name: 'Overview', exact: true }).first().click();
	await page.getByRole('link', { name: 'Timesheets', exact: true }).first().click();
	await page.getByRole('link', { name: 'Care record reports →', exact: true }).click();
	await page.getByRole('link', { name: 'Manage medication definitions →', exact: true }).click();
	await page
		.getByRole('combobox', { name: 'Medication home', exact: true })
		.selectOption({ label: 'Oak House' });
	await page
		.getByRole('combobox', { name: 'Medication person', exact: true })
		.selectOption({ label: person });
	const editor = page.getByRole('form', { name: 'Medication definition editor', exact: true });
	await expect(editor).toBeVisible();
	const accessibility = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(
		accessibility.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }))
	).toEqual([]);
	await editor.getByLabel('Medication and strength', { exact: true }).fill(title);
	await editor.getByLabel('Dose as written', { exact: true }).fill('Synthetic label wording only');
	await editor.getByLabel('Route as written', { exact: true }).fill('Demo route');
	await editor
		.getByLabel('Scheduled times (HH:mm, comma-separated)', { exact: true })
		.fill('99:99');
	await editor.getByRole('button', { name: 'Add medication', exact: true }).click();
	await expect(page.getByText(/^Enter one to 24 scheduled times/)).toBeVisible();
	await expect(
		editor.getByLabel('Scheduled times (HH:mm, comma-separated)', { exact: true })
	).toHaveValue('99:99');
	await expect(
		page
			.getByRole('article', { name: 'Active medication definition', exact: true })
			.filter({ hasText: title })
	).toHaveCount(0);
	await editor
		.getByLabel('Scheduled times (HH:mm, comma-separated)', { exact: true })
		.fill('08:00, 20:00');
	await editor
		.getByLabel('Prescription notes', { exact: true })
		.fill('Synthetic test fixture, not an actual prescription.');
	await editor.getByRole('button', { name: 'Add medication', exact: true }).click();
	await expect(
		page.getByText(
			'Medication definition saved. Daily care forms update after sync; recorded doses are unchanged.',
			{ exact: true }
		)
	).toBeVisible();
	const active = page
		.getByRole('article', { name: 'Active medication definition', exact: true })
		.filter({ hasText: title });
	await expect(active).toContainText('Scheduled: 08:00, 20:00');
	await active.getByRole('button', { name: 'Edit definition', exact: true }).click();
	await editor.getByRole('combobox', { name: 'When', exact: true }).selectOption('prn');
	await expect(editor.getByLabel('As-needed instructions', { exact: true })).toHaveAttribute(
		'required',
		''
	);
	await editor
		.getByLabel('As-needed instructions', { exact: true })
		.fill('Synthetic authorized wording for testing; no actual administration.');
	await editor.getByRole('button', { name: 'Save medication changes', exact: true }).click();
	await expect(active).toContainText('As needed (PRN)');
	await expect(active).not.toContainText('Scheduled:');
	await active.getByRole('button', { name: 'View medication history', exact: true }).click();
	const history = page.getByRole('region', { name: 'Medication change history', exact: true });
	await expect(history.getByRole('listitem').filter({ hasText: 'added' })).toContainText(
		'Sam Supervisor'
	);
	await expect(history.getByRole('listitem').filter({ hasText: 'updated' })).toContainText(
		'Sam Supervisor'
	);
	const cancelStop = page.waitForEvent('dialog').then((d) => d.dismiss());
	await active.getByRole('button', { name: 'Stop medication', exact: true }).click();
	await cancelStop;
	await expect(active).toBeVisible();
	const confirmStop = page.waitForEvent('dialog').then((d) => d.accept());
	await active.getByRole('button', { name: 'Stop medication', exact: true }).click();
	await confirmStop;
	await expect(
		page.getByText('Medication definition stopped. History and recorded doses are preserved.', {
			exact: true
		})
	).toBeVisible();
	await expect(active).toHaveCount(0);
	const stopped = page
		.getByRole('article', { name: 'Stopped medication definition', exact: true })
		.filter({ hasText: title });
	await expect(stopped).toBeHidden();
	await page.getByText(/^Stopped medication definitions \(/).click();
	await expect(stopped).toBeVisible();
	await expect(stopped.getByRole('button', { name: 'Edit definition', exact: true })).toHaveCount(
		0
	);
	await expect(stopped.getByRole('button', { name: 'Stop medication', exact: true })).toHaveCount(
		0
	);
	await stopped.getByRole('button', { name: 'View medication history', exact: true }).click();
	await expect(history.getByRole('listitem').filter({ hasText: 'stopped' })).toContainText(
		'Sam Supervisor'
	);
	await expect(history.getByRole('listitem').filter({ hasText: 'stopped' })).toContainText(/\d/);
	await context.setOffline(true);
	await expect(page.getByText(/^Reconnect to manage medication definitions/)).toBeVisible();
	await editor
		.getByLabel('Medication and strength', { exact: true })
		.fill('Synthetic unsaved offline definition');
	await editor
		.getByLabel('Scheduled times (HH:mm, comma-separated)', { exact: true })
		.fill('09:00');
	await editor.getByRole('button', { name: 'Add medication', exact: true }).click();
	await expect(
		page.getByText('Reconnect to save this medication definition. Your entries are kept.', {
			exact: true
		})
	).toBeVisible();
	await expect(editor.getByLabel('Medication and strength', { exact: true })).toHaveValue(
		'Synthetic unsaved offline definition'
	);
	await context.setOffline(false);
	const cancelDiscard = page.waitForEvent('dialog').then((d) => d.dismiss());
	await page.getByRole('link', { name: 'Overview', exact: true }).first().click();
	await cancelDiscard;
	await expect(editor.getByLabel('Medication and strength', { exact: true })).toHaveValue(
		'Synthetic unsaved offline definition'
	);
	const discard = page.waitForEvent('dialog').then((d) => d.accept());
	await editor.getByRole('button', { name: 'Cancel medication changes', exact: true }).click();
	await discard;
	await expect(editor.getByLabel('Medication and strength', { exact: true })).toHaveValue('');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
	const path = info.outputPath('medication-definitions-and-history.png');
	await page.screenshot({ path, fullPage: true });
	await info.attach('medication-definitions-and-history', { path, contentType: 'image/png' });
	await page.reload();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Unlock', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await expect(
		page.getByRole('combobox', { name: 'Medication home', exact: true })
	).not.toHaveValue('');
	await expect
		.poll(() =>
			page
				.getByRole('combobox', { name: 'Medication person', exact: true })
				.locator('option')
				.count()
		)
		.toBeGreaterThan(1);
});
