import { readFile } from 'node:fs/promises';
import { test, expect, type Download, type Page, type TestInfo } from '@playwright/test';

// The runner restricts services to loopback/demo-* and disables cloud providers.
// Each test gets a fresh browser context/OPFS profile; no browser storage shortcuts.
test.use({ timezoneId: 'UTC' });
const PIN = '654321';

test('expanded health readings and explicit bowel observations survive offline sync and export', async ({
	page,
	context
}, info) => {
	test.setTimeout(180000);
	const person = info.project.name === 'phone' ? 'Rosa Demo' : 'Marcus Demo';
	await signIn(page, 'supervisor@guad.test');
	await openPerson(page, person, true);
	await page.getByRole('link', { name: /^Health Vitals/ }).click();
	// Respiratory rate and SpO2; blood glucose has limits (charting-guide.md).
	await expect(
		page.getByText('No alert limits configured; follow the care plan', { exact: true })
	).toHaveCount(2);
	await context.setOffline(true);
	await page.getByLabel('Respiratory rate', { exact: true }).fill('18');
	await page.getByLabel('SpO2', { exact: true }).fill('97');
	await page.getByLabel('Blood glucose', { exact: true }).fill('101');
	await page.getByRole('button', { name: 'Save vitals', exact: true }).click();
	await expect(page.getByText(/^Vitals saved for /)).toBeVisible();
	await page.getByRole('button', { name: 'Bowel', exact: true }).click();
	await page.getByRole('button', { name: 'Save bowel', exact: true }).click();
	await expect(page.getByRole('alert')).toBeVisible();
	await page.getByLabel('Observation', { exact: true }).selectOption('Observed');
	await page
		.getByLabel('Consistency (only if observed)', { exact: true })
		.fill('Synthetic observation');
	await page.getByLabel('Observation', { exact: true }).selectOption('Not observed');
	await expect(page.getByLabel('Consistency (only if observed)', { exact: true })).toHaveCount(0);
	await page.getByLabel('Observation', { exact: true }).selectOption('Observed');
	await expect(page.getByLabel('Consistency (only if observed)', { exact: true })).toHaveValue('');
	await page
		.getByLabel('Consistency (only if observed)', { exact: true })
		.fill('Synthetic observation');
	await page.getByLabel('Time of observation or check', { exact: true }).fill('09:15');
	await page.getByRole('button', { name: 'Save bowel', exact: true }).click();
	await expect(page.getByText(/^Bowel saved for /)).toBeVisible();
	await context.setOffline(false);
	await synced(page);
	await proof(page, info, 'expanded-health-reconnected');
	await page.getByRole('link', { name: 'Overview', exact: true }).first().click();
	await page.getByRole('link', { name: 'Timesheets', exact: true }).first().click();
	await page.getByRole('link', { name: 'Care record reports →', exact: true }).click();
	await page.getByRole('combobox', { name: 'Report', exact: true }).selectOption('health');
	await page.getByRole('combobox', { name: 'Person', exact: true }).selectOption({ label: person });
	await page.getByRole('combobox', { name: 'Format', exact: true }).selectOption('json');
	const download = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download care report', exact: true }).click();
	const report = JSON.parse(await downloaded(await download, info, 'expanded-health.json'));
	expect(
		report.rows.some(
			(row: { data?: Record<string, unknown> }) =>
				row.data?.respiration === 18 && row.data?.oxygen === 97 && row.data?.glucose === 101
		)
	).toBe(true);
	expect(
		report.rows.some(
			(row: { kind?: string; data?: Record<string, unknown> }) =>
				row.kind === 'bowel' &&
				row.data?.status === 'Observed' &&
				row.data?.time === '09:15' &&
				row.data?.consistency === 'Synthetic observation'
		)
	).toBe(true);
});

async function signIn(page: Page, email: string, home = 'Oak House') {
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill(email);
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Make this device yours' })).toBeVisible();
	await page.getByLabel('Device PIN', { exact: true }).fill(PIN);
	await page.getByLabel('Confirm PIN', { exact: true }).fill(PIN);
	const open = page.getByRole('button', { name: 'Save PIN and open', exact: true });
	await open.click();
	await expect(open).toBeHidden();
	await page.getByLabel('Current home', { exact: true }).selectOption({ label: home });
	await synced(page);
}

async function synced(page: Page) {
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	await expect(page.getByText('could not be saved', { exact: false })).toHaveCount(0);
}

async function openPerson(page: Page, name: string, supervisor = false) {
	// SPA links retain the unlocked workspace. A hard goto would need another PIN.
	if (supervisor) {
		await page.getByRole('link', { name: 'Overview', exact: true }).first().click();
		await page.getByRole('link', { name: 'Care records', exact: true }).first().click();
	} else await page.getByRole('link', { name: 'Today', exact: true }).first().click();
	await page.getByRole('link', { name: new RegExp(name) }).click();
	await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

async function proof(page: Page, info: TestInfo, name: string) {
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
	const path = info.outputPath(`${name}.png`);
	await page.screenshot({ path, fullPage: true });
	await info.attach(name, { path, contentType: 'image/png' });
}

async function downloaded(download: Download, info: TestInfo, name: string) {
	expect(await download.failure()).toBeNull();
	const path = info.outputPath(name);
	await download.saveAs(path);
	return readFile(path, 'utf8');
}

test('signed MAR corrections preserve the original; health and attendance save additively', async ({
	page
}, info) => {
	test.setTimeout(180000);
	// Two different people/medications avoid shared dose-slot collisions across projects.
	const phone = info.project.name === 'phone';
	const person = phone ? 'Rosa Demo' : 'Marcus Demo';
	await signIn(page, 'cara@guad.test');
	await openPerson(page, person);
	await page.getByRole('link', { name: /^Medications/ }).click();
	const dose = page
		.locator('article.dose')
		.filter({ hasText: phone ? 'Demo med B' : 'Demo med A' })
		.first();
	await dose.getByRole('button', { name: /Mark as given/ }).click();
	const sheet = dose.getByRole('form', { name: 'Record dose' });
	await expect(
		sheet.getByRole('button', { name: 'Sign and record given', exact: true })
	).toBeDisabled();
	await sheet
		.getByRole('checkbox', {
			name: 'I, Cara Giver, confirm this dose record is accurate.',
			exact: true
		})
		.check();
	await sheet.getByRole('button', { name: 'Sign and record given', exact: true }).click();
	await expect(dose.getByText(/Given at .* by Cara Giver/)).toBeVisible();
	await synced(page);
	await dose.getByRole('button', { name: 'Correct this entry', exact: true }).click();
	await dose
		.getByRole('group', { name: 'Corrected status', exact: true })
		.getByRole('button', { name: 'Held', exact: true })
		.click();
	const correction = `Synthetic ${info.project.name} correction: demonstration entry only.`;
	await sheet
		.getByLabel('What was wrong with the earlier entry?', { exact: true })
		.fill(correction);
	await expect(
		sheet.getByRole('button', { name: 'Sign and record held', exact: true })
	).toBeDisabled();
	await sheet.getByRole('checkbox', { name: /I, Cara Giver, confirm this dose record/ }).check();
	await sheet.getByRole('button', { name: 'Sign and record held', exact: true }).click();
	await expect(
		page.getByText('Correction saved. The original entry is kept.', { exact: true })
	).toBeVisible();
	await expect(dose.getByText('Corrected: Held', { exact: true })).toBeVisible();
	await expect(dose.getByText(/Given at .* by Cara Giver/)).toBeVisible();
	await expect(dose.getByText(correction, { exact: false })).toBeVisible();
	await expect(dose.getByRole('button', { name: /delete/i })).toHaveCount(0);
	await synced(page);
	await proof(page, info, 'immutable-mar-correction');

	await openPerson(page, person);
	await page.getByRole('link', { name: /^Health Vitals/ }).click();
	await page.getByLabel('Temperature', { exact: true }).fill('99.1');
	await page.getByLabel('Pulse', { exact: true }).fill(phone ? '87' : '88');
	await page.getByRole('button', { name: 'Save vitals', exact: true }).click();
	await expect(page.getByText(/^Vitals saved for /)).toBeVisible();
	await expect(
		page.getByText(phone ? 'Pulse 87 · 99.1°F' : 'Pulse 88 · 99.1°F', { exact: true })
	).toBeVisible();
	await synced(page);
	await openPerson(page, person);
	await page.getByRole('link', { name: /^Attendance/ }).click();
	const first = page.getByRole('checkbox', { name: /^In-home support/ });
	await first.check();
	await page.getByRole('button', { name: 'Save attendance', exact: true }).click();
	await expect(first).toBeChecked();
	await expect(first).toBeDisabled();
	await synced(page);
	const second = page.getByRole('checkbox', { name: /^Community outing/ });
	await second.check();
	await page.getByRole('button', { name: 'Save attendance', exact: true }).click();
	await expect(first).toBeChecked();
	await expect(first).toBeDisabled();
	await expect(second).toBeChecked();
	await expect(second).toBeDisabled();
	await synced(page);
	await proof(page, info, 'additive-attendance');
});

test('incident requires a named signature and local Lomi changes require review with undo', async ({
	page
}, info) => {
	test.setTimeout(180000);
	const phone = info.project.name === 'phone';
	const person = phone ? 'Theo Demo' : 'Rosa Demo';
	await signIn(page, 'supervisor@guad.test', phone ? 'Maple House' : 'Oak House');
	await openPerson(page, person, true);
	await page.getByRole('link', { name: /^Report an incident/ }).click();
	await page
		.getByRole('group', { name: 'What kind of incident?', exact: true })
		.getByRole('button', { name: 'Other', exact: true })
		.click();
	await page
		.getByLabel('What happened', { exact: true })
		.fill(`Synthetic ${info.project.name} workflow demonstration; no actual incident.`);
	await page.getByRole('button', { name: 'Next', exact: true }).click();
	await page
		.getByLabel('What you did', { exact: true })
		.fill('Recorded this synthetic workflow for interface verification.');
	await page.getByRole('button', { name: 'Add a witness', exact: true }).click();
	await page.getByLabel('Witness 1 name', { exact: true }).fill('Synthetic Witness');
	await page
		.getByRole('combobox', { name: 'Witness 1 role', exact: true })
		.selectOption('Family or visitor');
	// State-reporting details are optional, but a restraint must be described.
	await page.getByText('Details for state reporting (optional)', { exact: true }).click();
	await page
		.getByRole('group', { name: 'Restraint or restrictive intervention used?', exact: true })
		.getByRole('button', { name: 'Physical hold', exact: true })
		.click();
	await page.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(page.getByText(/Describe the restraint or restrictive intervention/)).toBeVisible();
	await page
		.getByLabel('Describe the intervention', { exact: true })
		.fill('Synthetic hold description for interface verification.');
	await page.getByRole('button', { name: 'Next', exact: true }).click();
	const submit = page.getByRole('button', { name: 'Sign and submit report', exact: true });
	await expect(submit).toBeDisabled();
	await page
		.getByRole('checkbox', {
			name: 'I, Sam Supervisor, confirm this report is accurate.',
			exact: true
		})
		.check();
	await submit.click();
	await expect(page.getByRole('heading', { name: /Incident report submitted/i })).toBeVisible();
	await synced(page);
	await proof(page, info, 'incident-named-signature');

	await openPerson(page, person, true);
	await page.getByRole('link', { name: /^Shift note/ }).click();
	const observation = `Synthetic ${info.project.name} observation: selected a puzzle and placed four pieces.`;
	await page.getByLabel('Your observations', { exact: true }).fill(observation);
	await page.getByRole('button', { name: 'Prepare a draft', exact: true }).click();
	const review = page.locator('[aria-label="Review Lomi draft"]');
	await expect(review.getByText(/Simple sorting draft/)).toBeVisible();
	const draft = review.getByLabel('Activities', { exact: true });
	await expect(draft).toHaveValue(observation);
	// Lomi asks about the empty sections (at most three), next to each box too.
	const asks = review.getByRole('region', { name: 'Lomi asks' });
	await expect(asks.getByRole('listitem')).toHaveText([
		/^Did .+ eat their meals\?$/,
		/^What was .+'s mood today\?$/,
		'Any health observations: vitals, medications, concerns?'
	]);
	await review.getByRole('button', { name: 'Skip, nothing to add' }).first().click();
	await expect(asks.getByRole('listitem')).toHaveCount(2);
	// Lomi's text is slightly faded until the caregiver taps into the section.
	await expect(draft).toHaveCSS('opacity', '0.85');
	await draft.focus();
	await expect(draft).toHaveCSS('opacity', '1');
	// The caregiver's own words stay available, collapsed, to check the draft against.
	const said = review.locator('details.said');
	await expect(said).not.toHaveAttribute('open', '');
	await said.getByText('What I said', { exact: true }).click();
	await expect(said).toContainText(observation);
	const note = page.locator('form').getByLabel('Activities', { exact: true });
	await expect(note).toHaveValue('');
	await review.getByText('Refine activities with Lomi', { exact: true }).click();
	const extra = 'Staff offered two colored pencils.';
	await review
		.getByLabel('Additional observations or corrections for activities', { exact: true })
		.fill(extra);
	await review.getByRole('button', { name: 'Suggest a revision', exact: true }).first().click();
	await expect(
		review.getByRole('heading', { name: 'Review proposed changes', exact: true })
	).toBeVisible();
	await expect(draft).toHaveValue(observation);
	await review.getByRole('button', { name: 'Apply proposed changes', exact: true }).click();
	await expect(draft).toHaveValue(`${observation} ${extra}`);
	await review.getByRole('button', { name: 'Undo last accepted change', exact: true }).click();
	await expect(draft).toHaveValue(observation);
	page.once('dialog', (dialog) => dialog.accept());
	await review
		.getByRole('button', { name: 'Use this reviewed draft in my note', exact: true })
		.click();
	await expect(review).toBeHidden();
	await expect(note).toHaveValue(observation);
	await expect(page.getByRole('button', { name: 'Sign and submit', exact: true })).toBeDisabled();
	await page.getByRole('button', { name: 'Save draft', exact: true }).click();
	await expect(page.getByText('Draft saved on this device.', { exact: true })).toBeVisible();
	await synced(page);
	await proof(page, info, 'lomi-reviewed-unsigned-draft');
});

test('supervisor downloads bounded payroll and clinical exports with safe formats', async ({
	page
}, info) => {
	test.setTimeout(180000);
	const phone = info.project.name === 'phone';
	const person = phone ? 'Theo Demo' : 'Rosa Demo';
	const home = phone ? 'Maple House' : 'Oak House';
	await signIn(page, 'supervisor@guad.test', home);
	// Independent fixture through the UI: do not depend on preceding tests creating a record.
	await openPerson(page, person, true);
	await page.getByRole('link', { name: /^Health Vitals/ }).click();
	const pulse = phone ? 90 : 89;
	await page.getByLabel('Pulse', { exact: true }).fill(String(pulse));
	await page.getByRole('button', { name: 'Save vitals', exact: true }).click();
	await expect(page.getByText(/^Vitals saved for /)).toBeVisible();
	await synced(page);
	await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Oak House' });
	await page.getByRole('link', { name: 'Overview', exact: true }).first().click();
	await page.getByRole('link', { name: 'Timesheets', exact: true }).first().click();
	const day = new Date(Date.now() - (phone ? 4 : 5) * 86400000).toISOString().slice(0, 10);
	await page.getByLabel('From', { exact: true }).fill(`${day}T00:00`);
	await page.getByLabel('To', { exact: true }).fill(`${day}T23:59`);
	await page
		.getByRole('combobox', { name: 'Staff member', exact: true })
		.selectOption({ label: 'Cara Giver' });
	await page.getByLabel('Clock-in', { exact: true }).fill(`${day}T09:00`);
	await page.getByLabel('Clock-out', { exact: true }).fill(`${day}T11:00`);
	await page
		.getByLabel('Reason', { exact: true })
		.fill(`Synthetic ${info.project.name} payroll test correction.`);
	await page.getByRole('button', { name: 'Add manual entry for review', exact: true }).click();
	await expect(page.getByLabel('Reason', { exact: true })).toHaveValue('');
	await expect(page.getByRole('button', { name: 'Download JSON', exact: true })).toBeVisible();
	const payrollDownload = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download JSON', exact: true }).click();
	const payroll = JSON.parse(await downloaded(await payrollDownload, info, 'payroll.json'));
	expect(payroll.version).toBe(1);
	expect(payroll.totals.totalHours).toBe(2);
	expect(payroll.entries).toHaveLength(1);
	expect(payroll.entries[0]).toMatchObject({
		hours: 2,
		manual: true,
		acknowledged: false,
		staffName: 'Cara Giver'
	});
	expect(payroll.entries[0]).not.toHaveProperty('reason');
	expect(payroll.entries[0]).not.toHaveProperty('clock_in_lat');
	const csvDownload = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download CSV', exact: true }).click();
	const csv = await downloaded(await csvDownload, info, 'payroll.csv');
	expect(csv).toContain('Hours in report period');
	expect(csv).toContain('Cara Giver');
	expect(csv).not.toContain('payroll test correction');
	await proof(page, info, 'payroll-downloads');
	// Requires the clinical export increment to be integrated before this CI suite runs.
	await page.getByRole('link', { name: 'Care record reports →', exact: true }).click();
	await page.getByLabel('Current home', { exact: true }).selectOption({ label: home });
	await page.getByRole('combobox', { name: 'Report', exact: true }).selectOption('health');
	await page.getByRole('combobox', { name: 'Person', exact: true }).selectOption({ label: person });
	await page.getByRole('combobox', { name: 'Format', exact: true }).selectOption('json');
	const clinicalDownload = page.waitForEvent('download');
	const exportRequest = page.waitForRequest(
		(r) => r.url().includes('report.exportClinical') && r.method() === 'POST'
	);
	await page.getByRole('button', { name: 'Download care report', exact: true }).click();
	const request = await exportRequest;
	expect(decodeURIComponent(request.url())).not.toContain(person);
	expect(request.url()).not.toContain('input=');
	const clinical = JSON.parse(await downloaded(await clinicalDownload, info, 'care-report.json'));
	expect(clinical.type).toBe('health');
	expect(clinical.timeZone).toBeTruthy();
	expect(clinical.rows.some((r: { data?: { pulse?: number } }) => r.data?.pulse === pulse)).toBe(
		true
	);
	expect(clinical.rows.every((r: { clientName: string }) => r.clientName === person)).toBe(true);
	expect(clinical.rows.some((r: Record<string, unknown>) => 'dob' in r || 'address' in r)).toBe(
		false
	);
	await page.getByRole('combobox', { name: 'Format', exact: true }).selectOption('html');
	const htmlDownload = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download care report', exact: true }).click();
	const html = await downloaded(await htmlDownload, info, 'care-report.html');
	expect(html).toContain("default-src 'none'");
	expect(html).toContain('@media print');
	expect(html).not.toContain('<script');
	expect(html).toContain(person);
	await page.getByRole('combobox', { name: 'Format', exact: true }).selectOption('pdf');
	const pdfDownload = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download care report', exact: true }).click();
	const pdf = await pdfDownload;
	expect(pdf.suggestedFilename()).toBe('guad-care-report.pdf');
	expect((await downloaded(pdf, info, 'care-report.pdf')).startsWith('%PDF-')).toBe(true);
	await expect(page.getByText(/^Downloaded \d+ records\./)).toBeVisible();
	await proof(page, info, 'clinical-report-downloads');
});
