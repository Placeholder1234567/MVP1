import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('queued care reports require a connection and an explicit download, then forget another home’s job', async ({
	page,
	context
}, info) => {
	test.setTimeout(180000);
	const marker = `Synthetic queued report ${info.project.name} ${randomUUID()}`;
	const person = info.project.name === 'phone' ? 'Rosa Demo' : 'Marcus Demo';
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('supervisor@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Oak House' });
	await page.getByRole('link', { name: 'Overview', exact: true }).first().click();
	await page.getByRole('link', { name: 'Care records', exact: true }).first().click();
	await page.getByRole('link', { name: new RegExp(person) }).click();
	await page.getByRole('link', { name: /^Health Vitals/ }).click();
	await page.getByRole('button', { name: 'Bowel', exact: true }).click();
	await page.getByLabel('Observation', { exact: true }).selectOption('Observed');
	await page.getByLabel('Consistency (only if observed)', { exact: true }).fill(marker);
	await page.getByLabel('Time of observation or check', { exact: true }).fill('09:15');
	await page.getByRole('button', { name: 'Save bowel', exact: true }).click();
	await expect(page.getByText(/^Bowel saved for /)).toBeVisible();
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	await page.getByRole('link', { name: 'Overview', exact: true }).first().click();
	await page.getByRole('link', { name: 'Timesheets', exact: true }).first().click();
	await page.getByRole('link', { name: 'Care record reports →', exact: true }).click();
	await page.getByRole('link', { name: 'Prepare a larger care report →', exact: true }).click();
	await page.getByRole('combobox', { name: 'Report', exact: true }).selectOption('health');
	await page.getByRole('combobox', { name: 'Person', exact: true }).selectOption({ label: person });
	await page.getByRole('combobox', { name: 'Format', exact: true }).selectOption('json');
	const reportFrom = await page.getByLabel('From', { exact: true }).inputValue();
	const reportThrough = await page.getByLabel('Through', { exact: true }).inputValue();
	const request = page.getByRole('button', { name: 'Request background report', exact: true });
	await context.setOffline(true);
	await expect(request).toBeDisabled();
	await context.setOffline(false);
	await expect(request).toBeEnabled();
	let downloads = 0;
	page.on('download', () => downloads++);
	await request.click();
	await expect(page.getByRole('heading', { name: 'Report ready', exact: true })).toBeVisible({
		timeout: 90000
	});
	expect(downloads).toBe(0);
	await page.getByLabel('From', { exact: true }).fill('2000-01-01');
	const currentReport = page.getByRole('region', { name: 'Current report', exact: true });
	await expect(currentReport).toContainText(
		`Report period: ${reportFrom} through ${reportThrough}`
	);
	await expect(currentReport).toContainText(person);
	expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
	const screenshot = info.outputPath('queued-care-report-ready.png');
	await page.screenshot({ path: screenshot, fullPage: true });
	await info.attach('queued-care-report-ready', { path: screenshot, contentType: 'image/png' });
	const downloadEvent = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download prepared report', exact: true }).click();
	const download = await downloadEvent;
	expect(await download.failure()).toBeNull();
	const path = info.outputPath('synthetic-queued-report.json');
	await download.saveAs(path);
	const report = JSON.parse(await readFile(path, 'utf8'));
	expect(
		report.rows.some((row: { data?: { consistency?: string } }) => row.data?.consistency === marker)
	).toBe(true);
	expect(downloads).toBe(1);
	await page.reload();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Unlock', exact: true }).click();
	await expect(page.getByRole('region', { name: 'Current report', exact: true })).toHaveCount(0);
	const resume = page
		.getByRole('region', { name: 'Recent report requests', exact: true })
		.getByRole('button', { name: 'Select Health entries request', exact: true })
		.first();
	await expect(resume).toBeVisible();
	await resume.click();
	await expect(page.getByRole('region', { name: 'Current report', exact: true })).toBeVisible();
	expect(downloads).toBe(1);
	const currentHome = page.getByLabel('Current home', { exact: true });
	const other = await currentHome.locator('option').evaluateAll(
		(options) =>
			options
				.map((option) => ({
					value: (option as HTMLOptionElement).value,
					selected: (option as HTMLOptionElement).selected
				}))
				.find((option) => option.value && !option.selected)?.value
	);
	expect(other).toBeTruthy();
	await currentHome.selectOption(other!);
	await expect(page.getByRole('region', { name: 'Current report', exact: true })).toHaveCount(0);
	await expect(page.getByRole('combobox', { name: 'Person', exact: true })).toHaveValue('');
});
