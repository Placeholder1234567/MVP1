import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
const PIN = '654321';
const csvRow = (values: string[]) =>
	values.map((value) => `"${value.replaceAll('"', '""')}"`).join(',');
test('administrators review staff roles and assignments before inviting a synthetic account once', async ({
	page
}, info) => {
	test.setTimeout(180000);
	const email = `csv-${info.project.name}-${randomUUID()}@example.test`;
	await page.goto('/login');
	await page.getByLabel('Email', { exact: true }).fill('admin@guad.test');
	await page.getByLabel('Password', { exact: true }).fill('guad-dev-only-1');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByLabel('Device PIN', { exact: true }).fill(PIN);
	await page.getByLabel('Confirm PIN', { exact: true }).fill(PIN);
	await page.getByRole('button', { name: 'Save PIN and open', exact: true }).click();
	await expect(page.getByTestId('sync-status')).toHaveText('All changes synced');
	await page.goto('/dashboard/imports');
	await page.getByLabel('Device PIN', { exact: true }).fill(PIN);
	await page.getByRole('button', { name: 'Unlock', exact: true }).click();
	await page.getByLabel('Import type', { exact: true }).selectOption('staff');
	await page.getByText('Accessible IDs for your template', { exact: true }).click();
	const home = await page.getByLabel('Home ID for Oak House', { exact: true }).inputValue();
	const file = page.getByLabel('Select CSV file', { exact: true });
	await file.setInputFiles({
		name: 'synthetic-staff.csv',
		mimeType: 'text/csv',
		buffer: Buffer.from(
			`email,name,role,home_ids,med_certified\n${email},Synthetic CSV Staff,admin,${home},false`
		)
	});
	await expect(
		page.getByText('role must be caregiver or supervisor. Invite administrators individually.', {
			exact: true
		})
	).toBeVisible();
	await expect(
		page.getByRole('button', { name: 'Apply reviewed import', exact: true })
	).toBeDisabled();
	page.once('dialog', (dialog) => dialog.accept());
	await file.setInputFiles({
		name: 'synthetic-staff.csv',
		mimeType: 'text/csv',
		buffer: Buffer.from(
			`email,name,role,home_ids,med_certified\n${email},Synthetic CSV Staff,caregiver,${home},false`
		)
	});
	await expect(page.getByText('Preview ready.', { exact: false })).toBeVisible();
	await page
		.getByRole('checkbox', {
			name: 'I reviewed every value and destination and checked for duplicate records.'
		})
		.check();
	const confirmation = page.waitForEvent('dialog').then(async (dialog) => {
		expect(dialog.message()).toContain('sends password-setup invitations');
		await dialog.accept();
	});
	await page.getByRole('button', { name: 'Apply reviewed import', exact: true }).click();
	await confirmation;
	await expect(page.getByText('Import completed.', { exact: false })).toBeVisible();
	await expect(page.getByTestId('created-import-id')).toHaveText(/^[0-9a-f-]{36}$/);
	await expect(
		page.getByRole('button', { name: 'Apply reviewed import', exact: true })
	).toBeDisabled();
	page.once('dialog', (dialog) => dialog.accept());
	await file.setInputFiles({
		name: 'synthetic-staff.csv',
		mimeType: 'text/csv',
		buffer: Buffer.from(
			`email,name,role,home_ids,med_certified\n${email},Synthetic CSV Staff,caregiver,${home},false`
		)
	});
	await expect(
		page.getByText('Possible duplicate of an existing record.', { exact: true })
	).toBeVisible();
	await expect(
		page.getByRole('button', { name: 'Apply reviewed import', exact: true })
	).toBeDisabled();
});
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
	await expect(
		page.getByLabel('Import type', { exact: true }).locator('option[value="staff"]')
	).toHaveCount(0);
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
			'guardian,home_id,name,first_name,info,dob,allergies,conditions,diet,doctor,behaviors\n' +
				csvRow([
					'Synthetic guardian',
					home,
					name,
					'Synthetic',
					'Quoted, synthetic observation',
					'2000-02-29',
					'Synthetic allergy',
					'Synthetic condition',
					'Synthetic diet',
					'Synthetic doctor',
					JSON.stringify(['Quiet space', 'Cards, gestures'])
				])
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
				? 'client_id,area,text,frequency,target,steps\n' +
					csvRow([
						clientId!,
						'Daily living',
						`${name} goal`,
						'Daily',
						'One prompt',
						JSON.stringify(['First, prepare', 'Then finish'])
					])
				: `client_id,name,dose,route,scheduled_times,prn_instructions,notes\n${clientId},${name} medication,1 mg,oral,07:00;19:00,,Synthetic order only`;
		await file.setInputFiles({
			name: 'synthetic.csv',
			mimeType: 'text/csv',
			buffer: Buffer.from(csv)
		});
		await expect(page.getByText('Preview ready.', { exact: false })).toBeVisible();
		if (kind === 'goals')
			await expect(page.locator('dd').filter({ hasText: 'First, prepare' })).toBeVisible();
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
	page.once('dialog', (dialog) => dialog.accept());
	await page.getByRole('link', { name: '← Reports', exact: true }).click();
	// Let that navigation finish first; a goto during it is aborted (ERR_ABORTED).
	await page.waitForURL('**/dashboard/reports');
	await page.goto('/dashboard/people');
	await page.getByLabel('Device PIN', { exact: true }).fill(PIN);
	await page.getByRole('button', { name: 'Unlock', exact: true }).click();
	await page
		.getByRole('listitem')
		.filter({ hasText: name })
		.getByRole('button', { name: `Edit ${name}`, exact: true })
		.click();
	await expect(page.getByLabel('Date of birth', { exact: true })).toHaveValue('2000-02-29');
	await expect(page.getByLabel('Allergies', { exact: true })).toHaveValue('Synthetic allergy');
	await expect(page.getByLabel('Conditions', { exact: true })).toHaveValue('Synthetic condition');
	await expect(page.getByLabel('Diet', { exact: true })).toHaveValue('Synthetic diet');
	await expect(page.getByLabel('Doctor', { exact: true })).toHaveValue('Synthetic doctor');
	await expect(page.getByLabel('Guardian or contact', { exact: true })).toHaveValue(
		'Synthetic guardian'
	);
	await expect(page.getByLabel('Behaviors in support plan', { exact: true })).toHaveValue(
		'Quiet space, Cards, gestures'
	);
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await page.goto('/dashboard/goals');
	await page.getByLabel('Device PIN', { exact: true }).fill(PIN);
	await page.getByRole('button', { name: 'Unlock', exact: true }).click();
	await page
		.getByRole('combobox', { name: 'Goal home', exact: true })
		.selectOption({ label: 'Oak House' });
	await page
		.getByRole('combobox', { name: 'Goal person', exact: true })
		.selectOption({ label: name });
	await expect(page.getByText('First, prepare', { exact: true })).toBeVisible();
	await expect(page.getByText('Then finish', { exact: true })).toBeVisible();
	expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true
	);
	await page.screenshot({ path: info.outputPath('csv-import-review.png'), fullPage: true });
});
