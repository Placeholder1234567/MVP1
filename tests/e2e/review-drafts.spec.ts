import { test, expect } from '@playwright/test';

test('incident review keeps drafts in their home and protects a pending real save', async ({
	page
}, info) => {
	test.setTimeout(180000);
	const person = info.project.name === 'phone' ? 'Rosa Demo' : 'Marcus Demo';
	const description = `Synthetic ${info.project.name} review draft exercise; no actual incident.`;
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('supervisor@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByLabel('Device PIN', { exact: true })).toBeHidden();
	const home = page.getByLabel('Current home', { exact: true });
	await home.selectOption({ label: 'Oak House' });
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	await page.getByRole('link', { name: 'Care records', exact: true }).first().click();
	await page.getByRole('link', { name: new RegExp(person) }).click();
	await page.getByRole('link', { name: /^Report an incident/ }).click();
	await page.getByLabel('What happened', { exact: true }).fill(description);
	await page.getByRole('button', { name: 'Next', exact: true }).click();
	await page
		.getByLabel('What you did', { exact: true })
		.fill('Recorded a synthetic demonstration only.');
	await page.getByRole('button', { name: 'Next', exact: true }).click();
	await page
		.getByRole('checkbox', {
			name: 'I, Sam Supervisor, confirm this report is accurate.',
			exact: true
		})
		.check();
	await page.getByRole('button', { name: 'Sign and submit report', exact: true }).click();
	await expect(page.getByRole('heading', { name: /Incident report submitted/i })).toBeVisible();
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	await page.getByRole('link', { name: 'Overview', exact: true }).first().click();
	await page
		.locator('.attention-row')
		.filter({ hasText: person })
		.filter({ hasText: 'Fall' })
		.getByRole('button', { name: 'Review', exact: true })
		.first()
		.click();
	const review = page.getByRole('article', { name: 'Incident review', exact: true });
	await expect(review).toContainText(description);
	const contact = review.getByLabel('Record someone you contacted', { exact: true });
	await contact.fill('Synthetic contact draft');
	const stay = page.waitForEvent('dialog').then((dialog) => dialog.dismiss());
	await page.getByRole('link', { name: 'Schedule', exact: true }).first().click();
	await stay;
	await expect(contact).toHaveValue('Synthetic contact draft');
	const keepReload = page.waitForEvent('dialog').then(async (dialog) => {
		expect(dialog.type()).toBe('beforeunload');
		await dialog.dismiss();
	});
	const reviewUrl = page.url();
	// Trigger the real native prompt without awaiting a load that cancellation prevents.
	await page.evaluate(() => {
		setTimeout(() => window.location.reload(), 0);
	});
	await keepReload;
	await expect(page).toHaveURL(reviewUrl);
	await expect(contact).toHaveValue('Synthetic contact draft');
	await home.selectOption({ label: 'Maple House' });
	await expect(review).toBeHidden();
	await expect(
		page.getByText(
			'An unfinished review is kept for another home. Return to that home to continue.',
			{ exact: true }
		)
	).toBeVisible();
	await home.selectOption({ label: 'Oak House' });
	await expect(contact).toHaveValue('Synthetic contact draft');
	const followup = review.getByLabel('Your follow-up', { exact: true });
	await followup.fill('Synthetic completed review, retaining the original incident.');
	const save = review.getByRole('button', { name: 'Save review and close report', exact: true });
	await save.click();
	await expect(
		page.getByText('Record the contact or clear its entry before closing this report.', {
			exact: true
		})
	).toBeVisible();
	await contact.fill('');
	let release!: () => void;
	let intercepted!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const started = new Promise<void>((resolve) => {
		intercepted = resolve;
	});
	// Delay transport only; the real request still reaches the local test backend.
	await page.route('**/api/trpc/incident.review*', async (route) => {
		intercepted();
		await gate;
		await route.continue();
	});
	try {
		await save.click();
		await started;
		await expect(followup).toBeDisabled();
		await expect(review.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
		await page.getByRole('link', { name: 'Schedule', exact: true }).first().click();
		await expect(review).toBeVisible();
		await home.selectOption({ label: 'Maple House' });
		await expect(review).toBeHidden();
		release();
		await expect(
			page.getByText(
				'An unfinished review is kept for another home. Return to that home to continue.',
				{ exact: true }
			)
		).toBeHidden();
		await expect(
			page.getByText('Review saved. The list updates after sync.', { exact: true })
		).toBeHidden();
		await home.selectOption({ label: 'Oak House' });
		await expect(
			page.getByText('Review saved. The list updates after sync.', { exact: true })
		).toBeVisible();
		await expect(review).toBeHidden();
	} finally {
		release();
	}
});
