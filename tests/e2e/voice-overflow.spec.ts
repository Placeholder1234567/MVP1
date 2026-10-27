import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';

test.use({
	permissions: ['microphone'],
	launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }
});
const transcript = 'Renée reported no pain at 14:35; drank 250 mL.';
async function open(page: Page, followup = false, phone = false) {
	await page.route(/\/api\/trpc\/lomi\.capabilities(?:\?|$)/, (route) =>
		route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify([{ result: { data: { json: { voice: true, draft: false } } } }])
		})
	);
	await page.goto('/login');
	await page
		.getByLabel('Email', { exact: true })
		.fill(followup ? 'supervisor@guad.test' : 'cara@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await page
		.getByLabel('Current home', { exact: true })
		.selectOption({ label: followup && phone ? 'Maple House' : 'Oak House' });
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	if (followup) await page.getByRole('link', { name: 'Care records', exact: true }).first().click();
	await page
		.getByRole('link', { name: new RegExp(followup && phone ? 'Theo Demo' : 'Rosa Demo') })
		.click();
	await page.getByRole('link', { name: followup ? /^Shift note/ : /^Behavior note/ }).click();
}
async function record(page: Page, name: string) {
	await page.getByRole('button', { name, exact: true }).click();
	await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible();
	await page.waitForTimeout(1100); // Capture an actual synthetic MediaRecorder chunk.
	await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
}
for (const mode of ['full-note', 'section', 'follow-up'] as const) {
	test(`an oversized ${mode} transcript stays whole until explicit addition`, async ({
		page,
		context
	}, info) => {
		const section = mode === 'section',
			followup = mode === 'follow-up';
		await open(page, followup, info.project.name === 'phone');
		let routes = 0;
		page.on('request', (request) => {
			if (/\/api\/trpc\/lomi\.route(?:\?|$)/.test(request.url())) routes++;
		});
		let transcriptions = 0;
		await page.route(/\/api\/trpc\/lomi\.transcribe(?:\?|$)/, (route) => {
			transcriptions++;
			return route.fulfill({
				contentType: 'application/json',
				body: JSON.stringify([{ result: { data: { json: { text: transcript } } } }])
			});
		});
		const observations = page.getByLabel('Your observations', { exact: true });
		if (section || followup) {
			await observations.fill('Synthetic activity observation.');
			await page.getByRole('button', { name: 'Prepare a draft', exact: true }).click();
			if (section)
				await page.getByText('Refine what the person did with Lomi', { exact: true }).click();
		}
		const input = followup
			? page.getByLabel('Follow-up observations', { exact: true })
			: section
				? page.getByLabel('Additional observations or corrections for what the person did', {
						exact: true
					})
				: observations;
		if (followup) {
			await context.setOffline(true);
			try {
				await expect(
					page.getByRole('button', { name: 'Speak follow-up · up to 30 seconds', exact: true })
				).toBeDisabled();
				await expect(input).toBeEnabled();
				expect(transcriptions).toBe(0);
			} finally {
				await context.setOffline(false);
			}
			await expect(
				page.getByRole('button', { name: 'Speak follow-up · up to 30 seconds', exact: true })
			).toBeEnabled();
		}
		const original = 'x'.repeat(section || followup ? 1990 : 7990);
		await input.fill(original);
		const note = page
			.locator('form')
			.getByLabel(followup ? 'Activities' : 'What the person did', { exact: true });
		const originalNote = await note.inputValue();
		await record(
			page,
			followup
				? 'Speak follow-up · up to 30 seconds'
				: section
					? 'Speak · up to 30 seconds'
					: 'Speak · up to 5 minutes'
		);
		const pending = page.getByRole('region', { name: 'Transcript not added', exact: true });
		await expect(pending.getByLabel('Full transcript not yet added', { exact: true })).toHaveValue(
			transcript
		);
		await expect(input).toHaveValue(original);
		await pending.getByRole('button', { name: 'Add full transcript', exact: true }).click();
		await expect(input).toHaveValue(original);
		await expect(pending).toBeVisible();
		await input.fill('Caregiver revised observations.');
		await pending.getByRole('button', { name: 'Add full transcript', exact: true }).click();
		await expect(input).toHaveValue('Caregiver revised observations. ' + transcript);
		await expect(pending).toHaveCount(0);
		expect(transcriptions).toBe(1);
		expect(routes).toBe(0);
		if (followup) {
			await page.getByRole('button', { name: 'Suggest section updates', exact: true }).click();
			await expect(
				page.getByRole('region', { name: 'Proposed changes', exact: true })
			).toContainText(transcript);
			expect(routes).toBe(1);
		}
		await expect(note).toHaveValue(originalNote);
		await expect(page.getByRole('button', { name: 'Sign and submit', exact: true })).toBeDisabled();
		expect(
			(await new AxeBuilder({ page }).include('[aria-label="Lomi drafting assistant"]').analyze())
				.violations
		).toEqual([]);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		);
	});
}
test('an offline recording is kept when its transcript does not fit, then retried explicitly', async ({
	page,
	context
}) => {
	await open(page);
	let transcriptions = 0;
	await page.route(/\/api\/trpc\/lomi\.transcribe(?:\?|$)/, (route) => {
		transcriptions++;
		return route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify([{ result: { data: { json: { text: transcript } } } }])
		});
	});
	const observations = page.getByLabel('Your observations', { exact: true });
	const original = 'x'.repeat(7990);
	await observations.fill(original);
	await context.setOffline(true);
	try {
		await record(page, 'Speak · up to 5 minutes');
		await expect(
			page.getByText(/^You’re offline\. Your recording is saved on this device/)
		).toBeVisible();
		expect(transcriptions).toBe(0);
	} finally {
		await context.setOffline(false);
	}
	await expect(
		page.getByText(/^The saved recording does not fit in your observations/)
	).toBeVisible();
	await expect(observations).toHaveValue(original);
	expect(transcriptions).toBe(1);
	await observations.fill('Caregiver kept wording.');
	await page.getByRole('button', { name: 'Retry saved recordings', exact: true }).click();
	await expect(observations).toHaveValue('Caregiver kept wording. ' + transcript);
	await expect(
		page.getByRole('button', { name: 'Retry saved recordings', exact: true })
	).toHaveCount(0);
	expect(transcriptions).toBe(2);
	await expect(page.getByRole('button', { name: 'Sign and submit', exact: true })).toBeDisabled();
});
