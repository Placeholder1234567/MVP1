import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

test.use({ actionTimeout: 30000 });
test('coverage exports real recorded shifts explicitly and discards responses from another viewing context', async ({
	page,
	context
}, info) => {
	test.setTimeout(180000);
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('supervisor@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Oak House' });
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	await page.getByRole('link', { name: 'Schedule', exact: true }).first().click();
	for (let i = 0; i < 4; i++) {
		const oldWeek = await page.getByText(/^Week of /).innerText();
		await page.getByRole('button', { name: 'Next week →', exact: true }).click();
		await expect(page.getByText(/^Week of /)).not.toHaveText(oldWeek);
	}
	const week = (await page.getByText(/^Week of /).innerText()).replace('Week of ', '').trim();
	const date = new Date(`${week}T12:00:00Z`);
	date.setUTCDate(date.getUTCDate() + (info.project.name === 'phone' ? 5 : 4));
	const day = date.toISOString().slice(0, 10);
	const assignment = page.getByRole('combobox', { name: `${day} Morning assignment`, exact: true });
	const original = await assignment.inputValue();
	const cara = await assignment
		.getByRole('option', { name: /^Cara Giver · \d+ shifts? this week$/ })
		.getAttribute('value');
	expect(cara).toBeTruthy();
	if (original) await assignment.selectOption('');
	await expect(assignment).toHaveValue('');
	const shift = assignment.locator('..').locator('..');
	await shift.getByRole('button', { name: 'Find cover with Lomi', exact: true }).click();
	const recorded = page
		.getByRole('region', { name: 'Coverage activity', exact: true })
		.getByRole('article')
		.filter({ hasText: `${day} · Morning` });
	await expect(recorded).toContainText('Coverage requested');
	await assignment.selectOption(cara!);
	await expect(recorded).toContainText('Filled by Cara Giver');
	await Promise.all([
		page.waitForResponse(
			(r) =>
				r.url().includes(original ? 'schedule.setSlot' : 'schedule.clearSlot') &&
				r.request().method() === 'POST' &&
				r.status() === 200
		),
		assignment.selectOption(original)
	]);
	await expect(
		page.getByText('Schedule saved. Updates will appear after sync.', { exact: true })
	).toBeVisible();
	await expect(assignment).toHaveValue(original);
	// Schedule's phone dock intentionally has no Timesheets destination.
	await page.getByRole('button', { name: 'Search', exact: true }).click();
	await page.getByRole('combobox', { name: /^Search people/ }).fill('reports');
	await page
		.getByRole('option', { name: /^Reports/ })
		.first()
		.click();
	const form = page.getByRole('region', { name: 'Coverage log export', exact: true });
	await expect(form.getByRole('heading', { name: 'Coverage log', exact: true })).toBeVisible();
	await form.getByLabel('Coverage from', { exact: true }).fill(day);
	await form.getByLabel('Coverage through', { exact: true }).fill(day);
	await form.getByLabel('Coverage format', { exact: true }).selectOption('json');
	const downloadButton = form.getByRole('button', { name: 'Download coverage log', exact: true });
	await context.setOffline(true);
	await expect(downloadButton).toBeDisabled();
	await expect(form.getByLabel('Coverage from', { exact: true })).toHaveValue(day);
	await context.setOffline(false);
	await expect(downloadButton).toBeEnabled();
	let downloads = 0;
	page.on('download', () => downloads++);
	expect(downloads).toBe(0);
	const event = page.waitForEvent('download');
	await downloadButton.click();
	const file = await event;
	expect(await file.failure()).toBeNull();
	expect(file.suggestedFilename()).toBe('guad-coverage.json');
	const path = info.outputPath('synthetic-coverage.json');
	await file.saveAs(path);
	const report = JSON.parse(await readFile(path, 'utf8'));
	expect(report.version).toBe(2);
	expect(report.type).toBe('coverage');
	expect(report.fromDay).toBe(day);
	expect(report.toDay).toBe(day);
	expect(report.notificationVisibility).toBe('own_recipient_only');
	expect(report.offerEvidenceVisibility).toBe('selected_home_prospective');
	expect(report.rows).toContainEqual(
		expect.objectContaining({
			kind: 'request',
			day,
			shift: 'am',
			status: 'filled',
			filledName: 'Cara Giver'
		})
	);
	expect(report.rows).toContainEqual(
		expect.objectContaining({ kind: 'activity', description: 'Coverage requested' })
	);
	expect(report.evidenceLimits).toContain('Eligibility is not proof an offer was sent');
	expect(report.evidenceLimits).toContain('Missing evidence is unknown');
	expect(
		(await new AxeBuilder({ page }).include('section[aria-label="Coverage log export"]').analyze())
			.violations
	).toEqual([]);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
	await form.screenshot({ path: info.outputPath('coverage-export.png') });

	// Hold a real server result; changing home away and back must invalidate it.
	const routePattern = /\/api\/trpc\/[^?]*report\.exportCoverage(?:[,?]|$)/;
	let release!: () => void;
	let received!: () => void;
	let finished!: () => void;
	const gate = new Promise<void>((r) => (release = r));
	const held = new Promise<void>((r) => (received = r));
	const done = new Promise<void>((r) => (finished = r));
	await page.route(routePattern, async (route) => {
		try {
			const response = await route.fetch();
			expect(response.ok()).toBe(true);
			received();
			await gate;
			// The app may already have aborted this request after the scope change.
			await route.fulfill({ response }).catch(() => {});
		} finally {
			finished();
		}
	});
	try {
		await downloadButton.click();
		await held;
		await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Maple House' });
		await expect(form).toContainText('Maple House');
		await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Oak House' });
		await expect(form).toContainText('Oak House');
		release();
		await done;
		await expect(downloadButton).toBeEnabled();
		expect(downloads).toBe(1);
		await expect(form.getByText(/^Downloaded /)).toHaveCount(0);
	} finally {
		release();
		await page.unroute(routePattern);
	}
});

test('locking the workspace disposes a held real coverage export response', async ({
	page
}, info) => {
	test.setTimeout(120000);
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('supervisor@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	await page.getByRole('link', { name: 'Timesheets', exact: true }).first().click();
	await page.getByRole('link', { name: 'Care record reports →', exact: true }).click();
	const form = page.getByRole('region', { name: 'Coverage log export', exact: true });
	const button = form.getByRole('button', { name: 'Download coverage log', exact: true });
	await expect(button).toBeEnabled();
	let downloads = 0;
	page.on('download', () => downloads++);
	let release!: () => void;
	let received!: () => void;
	let finished!: () => void;
	const gate = new Promise<void>((r) => (release = r));
	const held = new Promise<void>((r) => (received = r));
	const done = new Promise<void>((r) => (finished = r));
	const pattern = /\/api\/trpc\/[^?]*report\.exportCoverage(?:[,?]|$)/;
	await page.route(pattern, async (route) => {
		try {
			const response = await route.fetch();
			expect(response.ok()).toBe(true);
			received();
			await gate;
			await route.fulfill({ response }).catch(() => {});
		} finally {
			finished();
		}
	});
	try {
		await button.click();
		await held;
		if (info.project.name === 'phone') await page.clock.setFixedTime(new Date(Date.now() - 60000));
		else await page.getByRole('button', { name: 'Lock device', exact: true }).first().click();
		await expect(
			page.getByRole('heading', { name: 'Workspace locked', exact: true })
		).toBeVisible();
		release();
		await done;
		await expect(form).toBeHidden();
		expect(downloads).toBe(0);
	} finally {
		release();
		await page.unroute(pattern);
	}
});
