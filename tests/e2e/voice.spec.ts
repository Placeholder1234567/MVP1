import { test, expect } from '@playwright/test';

// Chromium's synthetic source only; no hardware microphone or provider is used.
test.use({
	permissions: ['microphone'],
	launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] }
});

test('a synthetic voice clip becomes editable observations without drafting or signing', async ({
	page
}, info) => {
	let transcriptions = 0;
	await page.route(/\/api\/trpc\/lomi\.capabilities(?:\?|$)/, (route) =>
		route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify([{ result: { data: { json: { voice: true } } } }])
		})
	);
	await page.route(/\/api\/trpc\/lomi\.transcribe(?:\?|$)/, async (route) => {
		transcriptions++;
		const body = JSON.parse(route.request().postData() ?? '{}');
		expect(body['0'].json.audio.length).toBeGreaterThan(0);
		expect(body['0'].json.mimeType).toBe('audio/webm');
		await route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify([
				{ result: { data: { json: { text: 'Synthetic spoken observation for review.' } } } }
			])
		});
	});
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('cara@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Make this device yours' })).toBeVisible();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open' }).click();
	await page.getByLabel('Current home', { exact: true }).selectOption({ label: 'Oak House' });
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	await page.getByRole('link', { name: /Rosa Demo/ }).click();
	await page.getByRole('link', { name: /^Behavior note/ }).click();
	const observations = page.getByLabel('Your observations', { exact: true });
	await observations.fill('Synthetic typed observation.');
	await page.getByRole('button', { name: 'Speak · up to 55 seconds', exact: true }).click();
	const stop = page.getByRole('button', { name: 'Stop recording', exact: true });
	await expect(stop).toBeVisible();
	// Capture a real one-second synthetic audio chunk before stopping the device.
	await page.waitForTimeout(1100);
	await stop.click();
	await expect(observations).toHaveValue(
		'Synthetic typed observation. Synthetic spoken observation for review.'
	);
	expect(transcriptions).toBe(1);
	await expect(page.locator('[aria-label="Review Lomi draft"]')).toHaveCount(0);
	await expect(page.getByLabel('What happened right before', { exact: true })).toHaveValue('');
	await expect(page.getByRole('button', { name: 'Sign and submit', exact: true })).toBeDisabled();
	await page.screenshot({
		path: info.outputPath('synthetic-voice-observations.png'),
		fullPage: true
	});
});
