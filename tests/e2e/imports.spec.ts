import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
const PIN = '654321';
test('CSV imports require valid review, preserve offline preview and create each supported definition once', async ({
	page,
	context
}, info) => {
	test.setTimeout(240000);
	const name = `Synthetic CSV ${info.project.name} ${randomUUID().slice(0, 8)}`;
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('supervisor@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill(PIN);
	await page.getByLabel('Confirm PIN', { exact: true }).fill(PIN);
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	// A hard navigation deliberately rechecks the PIN; no browser-storage shortcuts.
	await page.goto('/dashboard/imports');
	await page.getByLabel('Device PIN', { exact: true }).fill(PIN);
	await page.getByRole('button', { name: 'Unlock', exact: true }).click();
	await expect(
		page.getByRole('heading', { name: 'Review CSV imports', exact: true })
	).toBeVisible();
	await page.getByText('Accessible IDs for your template', { exact: true }).click();
	const home = await page.getByLabel('Home ID for Oak House', { exact: true }).inputValue();
	const file = page.getByLabel('Select CSV file', { exact: true });
	await file.setInputFiles({
		name: 'synthetic.csv',
		mimeType: 'text/csv',
		buffer: Buffer.from('home_id,name,first_name,info\nunknown,Synthetic Bad,,')
	});
	await expect(
		page.getByText('home_id must identify an accessible home.', { exact: true })
	).toBeVisible();
	await expect(
		page.getByRole('button', { name: 'Apply reviewed import', exact: true })
	).toBeDisabled();
	page.once('dialog', (dialog) => dialog.accept());
	await file.setInputFiles({
		name: 'synthetic.csv',
		mimeType: 'text/csv',
		buffer: Buffer.from(
			`home_id,name,first_name,info\n${home},${name},Synthetic,"Quoted, synthetic observation"`
		)
	});
	await expect(page.getByText('Preview ready.', { exact: false })).toBeVisible();
	await page
		.getByRole('checkbox', {
			name: 'I reviewed every value and destination and checked for duplicate records.'
		})
		.check();
	await context.setOffline(true);
	await expect(
		page.getByText('Reconnect before preparing or applying an import.', { exact: false })
	).toBeVisible();
	await expect(
		page.getByRole('button', { name: 'Apply reviewed import', exact: true })
	).toBeDisabled();
	await expect(page.getByText(name, { exact: true })).toBeVisible();
	await context.setOffline(false);
	await expect(
		page.getByRole('button', { name: 'Apply reviewed import', exact: true })
	).toBeEnabled();
	page.once('dialog', (dialog) => dialog.accept());
	await page.getByRole('button', { name: 'Apply reviewed import', exact: true }).click();
	await expect(page.getByText('Import completed.', { exact: false })).toBeVisible();
	const clientId = await page.getByTestId('created-import-id').textContent();
	expect(clientId).toMatch(/^[0-9a-f-]{36}$/);
	await expect(
		page.getByRole('button', { name: 'Apply reviewed import', exact: true })
	).toBeDisabled();
	for (const kind of ['goals', 'medications'] as const) {
		page.once('dialog', (dialog) => dialog.accept());
		await page.getByRole('button', { name: 'Clear preview and outcomes', exact: true }).click();
		await page.getByLabel('Import type', { exact: true }).selectOption(kind);
		const csv =
			kind === 'goals'
				? `client_id,area,text,frequency,target\n${clientId},Daily living,${name} goal,Daily,One prompt`
				: `client_id,name,dose,route,scheduled_times,prn_instructions,notes\n${clientId},${name} medication,1 mg,oral,07:00;19:00,,Synthetic order only`;
		await file.setInputFiles({
			name: 'synthetic.csv',
			mimeType: 'text/csv',
			buffer: Buffer.from(csv)
		});
		await expect(page.getByText('Preview ready.', { exact: false })).toBeVisible();
		await expect(
			page.getByRole('heading', { name: new RegExp(`CSV line 2 → ${name}`) })
		).toBeVisible();
		await page
			.getByRole('checkbox', {
				name: 'I reviewed every value and destination and checked for duplicate records.'
			})
			.check();
		page.once('dialog', (dialog) => dialog.accept());
		await page.getByRole('button', { name: 'Apply reviewed import', exact: true }).click();
		await expect(page.getByText('Import completed.', { exact: false })).toBeVisible();
		await expect(
			page.getByRole('button', { name: 'Apply reviewed import', exact: true })
		).toBeDisabled();
	}
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
	await page.screenshot({ path: info.outputPath('csv-import-review.png'), fullPage: true });
});
