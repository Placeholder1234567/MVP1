import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

test('supervisor follows home-scoped coverage activity online and offline', async ({
	page,
	context
}, info) => {
	test.setTimeout(180000);
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
	await page.getByRole('link', { name: 'Schedule', exact: true }).first().click();
	await page.getByRole('button', { name: 'Next week →', exact: true }).click();
	const week = (await page.getByText(/^Week of /).innerText()).replace('Week of ', '').trim();
	const date = new Date(`${week}T12:00:00Z`);
	date.setUTCDate(date.getUTCDate() + (info.project.name === 'phone' ? 3 : 2));
	const day = date.toISOString().slice(0, 10);
	const assignment = page.getByRole('combobox', { name: `${day} Morning assignment`, exact: true });
	await expect(assignment.getByRole('option', { name: 'Cara Giver', exact: true })).toHaveCount(1);
	const original = await assignment.inputValue();
	const cara = await assignment
		.getByRole('option', { name: 'Cara Giver', exact: true })
		.getAttribute('value');
	expect(cara).toBeTruthy();
	try {
		await assignment.selectOption(cara!);
		await expect(
			page.getByText('Schedule saved. Updates will appear after sync.', { exact: true })
		).toBeVisible();
		await expect(assignment).toHaveValue(cara!);
		await assignment.selectOption('');
		await expect(assignment).toHaveValue('');
		const shift = assignment.locator('..').locator('..');
		await shift.getByRole('button', { name: 'Find cover with Lomi', exact: true }).click();
		const activity = page.getByRole('region', { name: 'Coverage activity', exact: true });
		const request = activity
			.getByRole('article', { name: 'Coverage request', exact: true })
			.filter({ hasText: `${day} · Morning` });
		await expect(request).toContainText('Coverage requested');
		await expect(request).toContainText(/Offered to \d+ eligible staff/);
		await expect(request).toContainText('Finding cover');
		await assignment.selectOption(cara!);
		await expect(request).toContainText('Filled by Cara Giver');
		await expect(request).toContainText('Schedule updated by supervisor');
		await context.setOffline(true);
		await expect(page.getByText(/You’re offline. Read saved recent activity/)).toBeVisible();
		await expect(assignment).toBeDisabled();
		await expect(request).toContainText('Coverage requested');
		await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Maple House' });
		await expect(activity.getByRole('article').filter({ hasText: `${day} · Morning` })).toHaveCount(
			0
		);
		await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Oak House' });
		await expect(request).toContainText('Schedule updated by supervisor');
		const audit = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
			.analyze();
		expect(
			audit.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }))
		).toEqual([]);
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
		).toBe(true);
		const screenshot = info.outputPath('coverage-activity.png');
		await activity.scrollIntoViewIfNeeded();
		await activity.screenshot({ path: screenshot });
		await info.attach('Coverage activity', { path: screenshot, contentType: 'image/png' });
	} finally {
		await context.setOffline(false);
		await expect(assignment).toBeEnabled();
		await assignment.selectOption(original);
		await expect(
			page.getByText('Schedule saved. Updates will appear after sync.', { exact: true })
		).toBeVisible();
	}
});

test('supervisor copies last week’s assignments into the open slots of this week', async ({
	page
}, info) => {
	test.setTimeout(180000);
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
	await page.getByRole('link', { name: 'Schedule', exact: true }).first().click();
	// Weeks no other test uses: three ahead on desktop, four on phone.
	const ahead = info.project.name === 'phone' ? 4 : 3;
	for (let i = 0; i < ahead; i++)
		await page.getByRole('button', { name: 'Next week →', exact: true }).click();
	const weekOf = async () =>
		(await page.getByText(/^Week of /).innerText()).replace('Week of ', '').trim();
	const lastWeek = await weekOf();
	const slot = (day: string) =>
		page.getByRole('combobox', { name: `${day} Evening assignment`, exact: true });
	const plus = (day: string, n: number) => {
		const d = new Date(`${day}T12:00:00Z`);
		d.setUTCDate(d.getUTCDate() + n);
		return d.toISOString().slice(0, 10);
	};
	const cara = await slot(plus(lastWeek, 2))
		.getByRole('option', { name: 'Cara Giver', exact: true })
		.getAttribute('value');
	await slot(plus(lastWeek, 2)).selectOption(cara!);
	await expect(
		page.getByText('Schedule saved. Updates will appear after sync.', { exact: true })
	).toBeVisible();
	await page.getByRole('button', { name: 'Next week →', exact: true }).click();
	const thisWeek = await weekOf();
	expect(thisWeek).toBe(plus(lastWeek, 7));
	try {
		await page.getByRole('button', { name: 'Copy last week’s assignments', exact: true }).click();
		await expect(page.getByText(/^Copied \d+ shifts? from last week\./)).toBeVisible();
		await expect(slot(plus(thisWeek, 2))).toHaveValue(cara!);
		const axe = await new AxeBuilder({ page }).analyze();
		expect(axe.violations).toEqual([]);
	} finally {
		await slot(plus(thisWeek, 2)).selectOption('');
		await page.getByRole('button', { name: '← Previous week', exact: true }).click();
		await slot(plus(lastWeek, 2)).selectOption('');
	}
});

test('supervisor saves a week as a template, fills another week from it and drags staff onto a shift', async ({
	page
}, info) => {
	test.setTimeout(180000);
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
	await page.getByRole('link', { name: 'Schedule', exact: true }).first().click();
	// Weeks no other test uses: six ahead on desktop, eight on phone.
	const ahead = info.project.name === 'phone' ? 8 : 6;
	for (let i = 0; i < ahead; i++)
		await page.getByRole('button', { name: 'Next week →', exact: true }).click();
	const weekOf = async () =>
		(await page.getByText(/^Week of /).innerText()).replace('Week of ', '').trim();
	const plus = (day: string, n: number) => {
		const d = new Date(`${day}T12:00:00Z`);
		d.setUTCDate(d.getUTCDate() + n);
		return d.toISOString().slice(0, 10);
	};
	const slot = (day: string, shift = 'Morning') =>
		page.getByRole('combobox', { name: `${day} ${shift} assignment`, exact: true });
	const saved = page.getByText('Schedule saved. Updates will appear after sync.', { exact: true });
	const first = await weekOf();
	const name = `Synthetic ${info.project.name} week ${Date.now()}`;
	const cara = await slot(plus(first, 1))
		.getByRole('option', { name: 'Cara Giver', exact: true })
		.getAttribute('value');
	try {
		await slot(plus(first, 1)).selectOption(cara!);
		await expect(saved).toBeVisible();
		await page.getByLabel('Save this week as', { exact: true }).fill(name);
		await page.getByRole('button', { name: 'Save template', exact: true }).click();
		await expect(page.getByText(`Saved “${name}” with 1 shift.`, { exact: true })).toBeVisible();

		await page.getByRole('button', { name: 'Next week →', exact: true }).click();
		const second = await weekOf();
		await page
			.getByRole('combobox', { name: 'Template', exact: true })
			.selectOption({ label: `${name} (1 shift)` });
		await page.getByRole('button', { name: 'Fill open shifts from template', exact: true }).click();
		await expect(page.getByText(new RegExp(`^Filled 1 open shift from “${name}”`))).toBeVisible();
		await expect(slot(plus(second, 1))).toHaveValue(cara!);

		if (info.project.name === 'desktop') {
			// Drag Cara onto Wednesday evening (HTML5 drag events, as a mouse drag sends them).
			const chip = page.locator('.palette').getByText('Cara Giver', { exact: true });
			const target = page.getByRole('group', { name: `${plus(second, 2)} Evening`, exact: true });
			const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
			await chip.dispatchEvent('dragstart', { dataTransfer });
			await target.dispatchEvent('dragover', { dataTransfer });
			await target.dispatchEvent('drop', { dataTransfer });
			await chip.dispatchEvent('dragend', { dataTransfer });
			await expect(saved).toBeVisible();
			await expect(slot(plus(second, 2), 'Evening')).toHaveValue(cara!);
			await slot(plus(second, 2), 'Evening').selectOption('');
		}
		const axe = await new AxeBuilder({ page }).analyze();
		expect(axe.violations).toEqual([]);
		await slot(plus(second, 1)).selectOption('');
		page.once('dialog', (d) => d.accept());
		await page.getByRole('button', { name: 'Delete template', exact: true }).click();
		await expect(page.getByText(`Deleted “${name}”.`, { exact: true })).toBeVisible();
	} finally {
		await page.getByRole('button', { name: '← Previous week', exact: true }).click();
		if ((await weekOf()) === first) await slot(plus(first, 1)).selectOption('');
	}
});
