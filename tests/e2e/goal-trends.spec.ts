import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

test('saved goal progress excludes drafts, counts signed trials and preserves stopped history offline', async ({
	page,
	context
}, info) => {
	test.setTimeout(180000);
	const person = info.project.name === 'phone' ? 'Rosa Demo' : 'Marcus Demo';
	const title = `Synthetic ${info.project.name} progress observation`;
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('supervisor@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Oak House' });
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	const goals = async () => {
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
	};
	const note = async () => {
		await page.getByRole('link', { name: 'Overview', exact: true }).first().click();
		await page.getByRole('link', { name: 'Care records', exact: true }).first().click();
		await page.getByRole('link', { name: new RegExp(person) }).click();
		await page.getByRole('link', { name: /^Shift note/ }).click();
	};
	await goals();
	await page.getByLabel('Goal area', { exact: true }).fill('Synthetic progress');
	await page.getByLabel('Goal wording', { exact: true }).fill(title);
	await page.getByRole('button', { name: 'Create goal', exact: true }).click();
	await expect(
		page.getByText('Goal saved. Care records receive the change after sync.', { exact: true })
	).toBeVisible();
	await note();
	await page
		.getByLabel('Activities', { exact: true })
		.fill('Synthetic observed support only, used to verify recorded goal progress.');
	const scoring = page.locator('section.card').filter({ hasText: title });
	await expect(scoring).toBeVisible();
	const addTrial = scoring.getByRole('combobox', { name: 'Add a trial', exact: true });
	for (const trial of ['Independent', 'Refused', 'Independent']) await addTrial.selectOption(trial);
	await page.getByRole('button', { name: 'Save draft', exact: true }).click();
	await expect(page.getByText('Draft saved on this device.', { exact: true })).toBeVisible();
	await goals();
	const active = page
		.getByRole('article', { name: 'Active goal', exact: true })
		.filter({ hasText: title });
	await expect(active).toContainText('No recorded attempted trials in this saved period.');
	await note();
	await page.getByRole('checkbox', { name: /I reviewed this note/ }).check();
	await page.getByRole('button', { name: 'Sign and submit', exact: true }).click();
	await expect(page.getByLabel('Activities', { exact: true })).toBeDisabled();
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	await goals();
	await expect(active).toContainText('67% independent');
	await expect(active).toContainText('2 of 3 recorded trials');
	await context.setOffline(true);
	await expect(active).toContainText('67% independent');
	await active.getByText('Daily recorded trials', { exact: true }).click();
	await expect(
		active.getByRole('listitem').filter({ hasText: 'No attempted trials' }).first()
	).toBeVisible();
	const accessibility = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	expect(
		accessibility.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }))
	).toEqual([]);
	await context.setOffline(false);
	// The person page lists every active goal at a glance from the same saved notes.
	await page.evaluate(() => {
		const a = document.createElement('a');
		a.href = '/dashboard/people';
		document.body.append(a);
		a.click();
		a.remove();
	});
	await page
		.getByRole('link', { name: new RegExp(person) })
		.first()
		.click();
	const glance = page
		.getByRole('region', { name: 'Goals at a glance', exact: true })
		.getByRole('listitem')
		.filter({ hasText: title });
	await expect(glance.getByRole('img', { name: '67% independent', exact: true })).toBeVisible();
	await expect(glance).toContainText('2 of 3 trials independent');
	await goals();
	const confirmStop = page.waitForEvent('dialog').then((dialog) => dialog.accept());
	await active.getByRole('button', { name: 'Stop goal', exact: true }).click();
	await confirmStop;
	await page.getByText(/^Stopped goals \(/).click();
	const stopped = page
		.getByRole('article', { name: 'Stopped goal', exact: true })
		.filter({ hasText: title });
	await expect(stopped).toContainText('67% independent');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
	const screenshot = info.outputPath('recorded-goal-progress.png');
	await stopped.screenshot({ path: screenshot });
	await info.attach('Recorded goal progress', { path: screenshot, contentType: 'image/png' });
});
