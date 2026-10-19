import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import { draftLocally } from '../../src/lib/domain/lomi';

async function renderBoundary(page: Page) {
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			)
	);
}

async function openReview(page: Page, phone: boolean, kind = /^Shift note/) {
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('supervisor@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByLabel('Confirm PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await page
		.getByLabel('Current home', { exact: true })
		.selectOption({ label: phone ? 'Maple House' : 'Oak House' });
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	await page.getByRole('link', { name: 'Care records', exact: true }).first().click();
	await page.getByRole('link', { name: new RegExp(phone ? 'Theo Demo' : 'Rosa Demo') }).click();
	await page.getByRole('link', { name: kind }).click();
}

test('a reconnect request that fails while privacy-masked remains queued for unmask', async ({
	page,
	context
}, info) => {
	test.setTimeout(180000);
	await openReview(page, info.project.name === 'phone');
	await context.setOffline(true);
	const observation = 'Synthetic activity for a privacy retry.';
	await page.getByLabel('Your observations', { exact: true }).fill(observation);
	await page.getByRole('button', { name: 'Prepare a draft', exact: true }).click();
	const review = page.getByRole('group', { name: 'Review Lomi draft', exact: true });
	await expect(review.getByText(/Simple sorting draft/)).toBeVisible();
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	let requests = 0;
	await page.route(/\/api\/trpc\/lomi\.draft(?:\?|$)/, async (route) => {
		requests++;
		if (requests === 1) {
			await held;
			await route.abort('failed');
			return;
		}
		const next = {
			...draftLocally(observation, 'shift'),
			content: { activities: 'Synthetic recovered activity.', meals: '', mood: '', health: '' },
			fallback: false
		};
		await route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify([{ result: { data: { json: next } } }])
		});
	});
	try {
		await context.setOffline(false);
		await expect.poll(() => requests).toBe(1);
		await page.evaluate(() => {
			Object.defineProperty(document, 'hidden', { value: true, configurable: true });
			document.dispatchEvent(new Event('visibilitychange'));
		});
		await expect(page.getByRole('heading', { name: 'Workspace locked' })).toBeVisible();
		const failed = page.waitForEvent('requestfailed', {
			predicate: (request) => /\/api\/trpc\/lomi\.draft(?:\?|$)/.test(request.url())
		});
		release();
		await failed;
		await renderBoundary(page);
		expect(requests).toBe(1);
		await page.evaluate(() => {
			Object.defineProperty(document, 'hidden', { value: false, configurable: true });
			document.dispatchEvent(new Event('visibilitychange'));
		});
		await expect(review.getByLabel('Activities', { exact: true })).toHaveValue(
			'Synthetic recovered activity.'
		);
		expect(requests).toBe(2);
	} finally {
		release();
		await context.setOffline(false);
	}
});

test('an offline fallback waits through a privacy lock and resumes after PIN unlock', async ({
	page,
	context
}, info) => {
	test.setTimeout(180000);
	await openReview(page, info.project.name === 'phone');
	await context.setOffline(true);
	await page.getByLabel('Your observations', { exact: true }).fill('Synthetic puzzle observation.');
	await page.getByRole('button', { name: 'Prepare a draft', exact: true }).click();
	const review = page.getByRole('group', { name: 'Review Lomi draft', exact: true });
	await expect(review.getByText(/Simple sorting draft/)).toBeVisible();
	await review.getByLabel('Mood', { exact: true }).fill('Caregiver mood observation.');
	let requests = 0;
	await page.route(/\/api\/trpc\/lomi\.draft(?:\?|$)/, (route) => {
		requests++;
		return route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify([
				{
					result: {
						data: {
							json: {
								content: {
									activities: 'Synthetic unlocked activity.',
									meals: '',
									mood: 'AI mood.',
									health: ''
								},
								flags: [],
								incident: { detected: false, summary: '' },
								fallback: false
							}
						}
					}
				}
			])
		});
	});
	await page.clock.setFixedTime(new Date(Date.now() + 16 * 60 * 1000));
	await expect(page.getByRole('heading', { name: 'Workspace locked' })).toBeVisible();
	await context.setOffline(false);
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			)
	);
	expect(requests).toBe(0);
	await page.getByLabel('Device PIN', { exact: true }).fill('654321');
	await page.getByRole('button', { name: 'Unlock workspace', exact: true }).click();
	await expect(review.getByLabel('Activities', { exact: true })).toHaveValue(
		'Synthetic unlocked activity.'
	);
	await expect(review.getByLabel('Mood', { exact: true })).toHaveValue(
		'Caregiver mood observation.'
	);
	expect(requests).toBe(1);
});

test('signing removes a fallback composer and discards its in-flight redraft', async ({
	page,
	context
}, info) => {
	test.setTimeout(180000);
	await openReview(page, info.project.name === 'phone', /^Behavior note/);
	await context.setOffline(true);
	await page
		.getByLabel('Your observations', { exact: true })
		.fill('Synthetic behavior observation.');
	await page.getByRole('button', { name: 'Prepare a draft', exact: true }).click();
	const review = page.getByRole('group', { name: 'Review Lomi draft', exact: true });
	await expect(review.getByText(/Simple sorting draft/)).toBeVisible();
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	let requests = 0;
	await page.route(/\/api\/trpc\/lomi\.draft(?:\?|$)/, async (route) => {
		requests++;
		await held;
		await route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify([
				{
					result: {
						data: {
							json: {
								content: {
									before: '',
									behavior: 'Synthetic AI text that must be discarded.',
									response: '',
									outcome: '',
									duration: ''
								},
								flags: [],
								incident: { detected: false, summary: '' },
								fallback: false
							}
						}
					}
				}
			])
		});
	});
	try {
		await context.setOffline(false);
		await expect.poll(() => requests).toBe(1);
		await context.setOffline(true);
		const note = page.locator('form').getByLabel('What the person did', { exact: true });
		await note.fill('Synthetic caregiver text for the signed record.');
		await page.getByRole('checkbox', { name: /I reviewed this note/ }).check();
		await page.getByRole('button', { name: 'Sign and submit', exact: true }).click();
		await expect(page.getByRole('group', { name: 'Review Lomi draft', exact: true })).toHaveCount(
			0
		);
		await expect(page.getByRole('region', { name: 'Lomi drafting assistant' })).toHaveCount(0);
		await context.setOffline(false);
		const response = page.waitForResponse(/\/api\/trpc\/lomi\.draft(?:\?|$)/);
		release();
		await (await response).finished();
		await expect(note).toHaveValue('Synthetic caregiver text for the signed record.');
		await expect(note).toBeDisabled();
	} finally {
		release();
		await context.setOffline(false);
	}
});

for (const leave of [false, true]) {
	test(`reconnect redrafting ${leave ? 'discards a response after the review is used' : 'preserves edits made before and during the request'}`, async ({
		page,
		context
	}, info) => {
		test.setTimeout(180000);
		await openReview(page, info.project.name === 'phone');
		const observation = 'Synthetic observation: selected a puzzle and placed four pieces.';
		const note = page.locator('form').getByLabel('Activities', { exact: true });
		const initialNote = await note.inputValue();
		await context.setOffline(true);
		await page.getByLabel('Your observations', { exact: true }).fill(observation);
		await page.getByRole('button', { name: 'Prepare a draft', exact: true }).click();
		const review = page.getByRole('group', { name: 'Review Lomi draft', exact: true });
		await expect(review.getByText(/Simple sorting draft/)).toBeVisible();
		await review.getByLabel('Mood', { exact: true }).fill('Caregiver edit.');
		await review.getByLabel('Mood', { exact: true }).fill('');
		let release!: () => void;
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		let requests = 0;
		await page.route(/\/api\/trpc\/lomi\.draft(?:\?|$)/, async (route) => {
			requests++;
			const input = JSON.parse(route.request().postData() ?? '{}')['0'].json;
			expect(input.prompt).toBe(observation);
			await held;
			await route.fulfill({
				contentType: 'application/json',
				body: JSON.stringify([
					{
						result: {
							data: {
								json: {
									content: {
										activities: 'Synthetic refreshed activity.',
										meals: '',
										mood: 'AI mood.',
										health: 'AI health.'
									},
									flags: [],
									incident: { detected: false, summary: '' },
									fallback: false
								}
							}
						}
					}
				])
			});
		});
		try {
			await context.setOffline(false);
			await expect.poll(() => requests).toBe(1);
			if (leave) {
				page.once('dialog', (dialog) => dialog.accept());
				await review
					.getByRole('button', { name: 'Use this reviewed draft in my note', exact: true })
					.click();
				await expect(review).toBeHidden();
				const response = page.waitForResponse(/\/api\/trpc\/lomi\.draft(?:\?|$)/);
				release();
				await (await response).finished();
				await expect(note).toHaveValue(observation);
			} else {
				await review
					.getByLabel('Health and safety', { exact: true })
					.fill('Caregiver observation during request.');
				await review
					.getByLabel('Follow-up observations', { exact: true })
					.fill('Pending caregiver follow-up.');
				const response = page.waitForResponse(/\/api\/trpc\/lomi\.draft(?:\?|$)/);
				release();
				await (await response).finished();
				await renderBoundary(page);
				await expect(review.getByLabel('Activities', { exact: true })).toHaveValue(observation);
				await review
					.getByRole('button', { name: 'Clear follow-up observations', exact: true })
					.click();
				await expect.poll(() => requests).toBe(2);
				await expect(review.getByLabel('Activities', { exact: true })).toHaveValue(
					'Synthetic refreshed activity.'
				);
				await expect(review.getByLabel('Mood', { exact: true })).toHaveValue('');
				await expect(review.getByLabel('Health and safety', { exact: true })).toHaveValue(
					'Caregiver observation during request.'
				);
				await expect(
					review.getByText(/Lomi updated untouched sections after reconnecting/)
				).toBeVisible();
				await expect(note).toHaveValue(initialNote);
				expect(
					(await new AxeBuilder({ page }).include('[aria-label="Review Lomi draft"]').analyze())
						.violations
				).toEqual([]);
			}
			await expect(
				page.getByRole('button', { name: 'Sign and submit', exact: true })
			).toBeDisabled();
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
				true
			);
			await page.screenshot({ path: info.outputPath('reconnect-review.png'), fullPage: true });
		} finally {
			release();
			await context.setOffline(false);
		}
	});
}

for (const unchanged of [false, true]) {
	test(`reconnect keeps an original incident warning ${unchanged ? 'without relabeling unchanged fallback text' : 'when AI rewrites the incident without its original keywords'}`, async ({
		page,
		context
	}, info) => {
		test.setTimeout(180000);
		await openReview(page, info.project.name === 'phone');
		const observation = 'Selected a puzzle. He fell in the bathroom.';
		const fallback = draftLocally(observation, 'shift');
		let requests = 0;
		await page.route(/\/api\/trpc\/lomi\.draft(?:\?|$)/, (route) => {
			requests++;
			const output =
				requests === 1
					? fallback
					: {
							...fallback,
							content: unchanged
								? fallback.content
								: {
										activities: 'Selected an activity.',
										meals: '',
										mood: '',
										health: 'Lost balance and sat on the floor.'
									},
							incident: { detected: false, summary: '' },
							fallback: false,
							goalReferences: []
						};
			return route.fulfill({
				contentType: 'application/json',
				body: JSON.stringify([{ result: { data: { json: output } } }])
			});
		});
		await page.getByLabel('Your observations', { exact: true }).fill(observation);
		await page.getByRole('button', { name: 'Prepare a draft', exact: true }).click();
		const review = page.getByRole('group', { name: 'Review Lomi draft', exact: true });
		const warning = review.getByText(/This description may need a separate incident report/);
		await expect(warning).toBeVisible();
		// A short privacy mask without a network event must not re-send unavailable-AI fallbacks.
		await page.evaluate(() => {
			Object.defineProperty(document, 'hidden', { value: true, configurable: true });
			document.dispatchEvent(new Event('visibilitychange'));
		});
		await expect(page.getByRole('heading', { name: 'Workspace locked' })).toBeVisible();
		await page.evaluate(() => {
			Object.defineProperty(document, 'hidden', { value: false, configurable: true });
			document.dispatchEvent(new Event('visibilitychange'));
		});
		await expect(review).toBeVisible();
		await renderBoundary(page);
		expect(requests).toBe(1);
		await context.setOffline(true);
		await context.setOffline(false);
		await expect.poll(() => requests).toBe(2);
		await renderBoundary(page);
		if (unchanged) {
			await expect(review.getByText(/Simple sorting draft/)).toBeVisible();
			await expect(review.getByLabel('Health and safety', { exact: true })).toHaveValue(
				fallback.content.health
			);
		} else {
			await expect(review.getByLabel('Health and safety', { exact: true })).toHaveValue(
				'Lost balance and sat on the floor.'
			);
			await expect(review.getByText(/AI-generated draft/)).toBeVisible();
		}
		await expect(warning).toBeVisible();
	});
}
