import { expect, it } from 'vitest';
import {
	CSV_LIMITS,
	IMPORT_HEADERS,
	type ImportKind,
	parseImportCsv,
	previewImport,
	importKey
} from '../../../src/lib/domain/csv-import';
const home = '16fd652e-7ddc-425b-8798-a02ec3c43416',
	client = '169e211b-f093-4a25-9a88-b3938d968d0c';
const context = {
	homes: [{ id: home, name: 'Synthetic House' }],
	people: [{ id: client, name: 'Synthetic Person', homeId: home, active: true }]
};
it('enforces each management API field limit before allowing an import', () => {
	const definitions: Array<{
		kind: ImportKind;
		values: Record<string, string>;
		bounds: Record<string, number>;
	}> = [
		{
			kind: 'people',
			values: { home_id: home, name: 'New Person' },
			bounds: { name: 100, first_name: 50, info: 4000 }
		},
		{
			kind: 'goals',
			values: { client_id: client, area: 'Daily living', text: 'Practice' },
			bounds: { area: 120, text: 2000, frequency: 200, target: 500 }
		},
		{
			kind: 'medications',
			values: { client_id: client, name: 'Synthetic', prn_instructions: 'Follow order' },
			bounds: { name: 200, dose: 200, route: 100, prn_instructions: 2000, notes: 4000 }
		}
	];
	for (const definition of definitions)
		for (const [field, max] of Object.entries(definition.bounds)) {
			const values = { ...definition.values, [field]: 'x'.repeat(max + 1) };
			const csv =
				IMPORT_HEADERS[definition.kind].join(',') +
				'\n' +
				IMPORT_HEADERS[definition.kind].map((header) => values[header] ?? '').join(',');
			if (max === 4000) expect(() => parseImportCsv(csv)).toThrow(/4,000/);
			else
				expect(previewImport(definition.kind, parseImportCsv(csv), context)[0].errors).toContain(
					`${field} is too long (maximum ${max}).`
				);
		}
});
it('parses BOM, quoted commas, doubled quotes and embedded CRLF with source lines', () => {
	expect(
		parseImportCsv(
			'\uFEFFname,info\r\n"Synthetic, Person","Said ""hello""\r\nThen walked."\r\nSecond,Plain\r\n'
		)
	).toEqual({
		headers: ['name', 'info'],
		rows: [
			{ line: 2, cells: ['Synthetic, Person', 'Said "hello"\nThen walked.'] },
			{ line: 4, cells: ['Second', 'Plain'] }
		]
	});
});
it('rejects malformed quotes, missing/duplicate headers and NUL without echoing source text', () => {
	for (const text of [
		'name,name\nA,B',
		'name,\nA,B',
		'name\n"secret',
		'name\nsecret"bad',
		'name\n"secret"tail',
		'name\nsecret\0',
		'name\n'
	]) {
		expect(() => parseImportCsv(text)).toThrow();
		try {
			parseImportCsv(text);
		} catch (error) {
			expect((error as Error).message).not.toContain('secret');
		}
	}
});
it('enforces byte, field, column and row limits, including multibyte input', () => {
	for (const text of [
		'x'.repeat(CSV_LIMITS.bytes + 1),
		'a\n' + ('é'.repeat(3900) + '\n').repeat(40),
		'a\n' + 'x'.repeat(4001),
		'a\n' + 'x\n'.repeat(101),
		Array.from({ length: 17 }, (_, i) => `h${i}`).join(',') + '\nx'
	])
		expect(() => parseImportCsv(text)).toThrow();
	expect(parseImportCsv('a\n' + 'x\n'.repeat(100)).rows).toHaveLength(100);
});
it('skips blank records and treats formula-looking cells as literal text', () => {
	expect(parseImportCsv('name,info\n\n"=1+1","@SUM(A1)"\n,\n').rows).toEqual([
		{ line: 3, cells: ['=1+1', '@SUM(A1)'] }
	]);
});
it('requires known headers, resolves exact accessible IDs and flags duplicates', () => {
	const rows = previewImport(
		'people',
		parseImportCsv(
			`name,home_id,info,first_name\nNew Person,${home},Notes,New\nNew Person,${home},Other,New`
		),
		context
	);
	expect(rows[0]).toMatchObject({
		target: 'Synthetic House',
		errors: [],
		payload: { kind: 'people', input: { name: 'New Person', homeId: home } }
	});
	expect(rows[1].errors).toContain('Possible duplicate within this CSV.');
	expect(
		previewImport(
			'people',
			parseImportCsv(`home_id,name,first_name,info\n${home}, Synthetic Person ,,`),
			context
		)[0].errors
	).toContain('Possible duplicate of an existing record.');
	expect(() => previewImport('people', parseImportCsv('home_id,name\nx,y'), context)).toThrow(
		/exactly/
	);
	expect(
		previewImport(
			'people',
			parseImportCsv('home_id,name,first_name,info\nforeign,Name,,'),
			context
		)[0].errors
	).toContain('home_id must identify an accessible home.');
});
it('flags wrong-width, missing and excessive fields rather than guessing positions', () => {
	const rows = previewImport(
		'people',
		parseImportCsv(`home_id,name,first_name,info\n${home},\n${home},${'a'.repeat(101)},,`),
		context
	);
	expect(rows[0].errors).toContain('The number of fields does not match the header.');
	expect(rows[0].errors).toContain('name is required.');
	expect(rows[1].errors).toContain('name is too long (maximum 100).');
});
it('maps goals to active accessible people and detects existing definitions', () => {
	const csv = parseImportCsv(
		`client_id,area,text,frequency,target\n${client},Daily living,Practice brushing,Daily,One prompt`
	);
	expect(previewImport('goals', csv, context)[0]).toMatchObject({
		target: 'Synthetic Person · Synthetic House',
		errors: [],
		payload: {
			kind: 'goals',
			input: { clientId: client, area: 'Daily living', text: 'Practice brushing' }
		}
	});
	expect(
		previewImport('goals', csv, {
			...context,
			existingKeys: [importKey('goals', [client, 'Daily living', 'Practice brushing'])]
		})[0].errors
	).toContain('Possible duplicate of an existing record.');
	expect(
		previewImport('goals', csv, {
			...context,
			people: [{ ...context.people[0], active: false }]
		})[0].errors
	).toContain('client_id must identify an accessible active person.');
});
it('validates scheduled/PRN medication definitions without producing signing or MAR fields', () => {
	const header = 'client_id,name,dose,route,scheduled_times,prn_instructions,notes\n';
	const good = previewImport(
		'medications',
		parseImportCsv(header + `${client},Synthetic med,1 mg,oral,07:00;19:00,,Review order`),
		context
	)[0];
	expect(good.errors).toEqual([]);
	expect(good.payload).toMatchObject({
		kind: 'medications',
		input: { scheduledTimes: ['07:00', '19:00'] }
	});
	expect(JSON.stringify(good.payload)).not.toMatch(/signed|signature|status/);
	for (const fields of ['07:00,Use as needed', ',', '25:00,', '07:00;07:00,'])
		expect(
			previewImport(
				'medications',
				parseImportCsv(header + `${client},Synthetic med,1 mg,oral,${fields},`),
				context
			)[0].errors.length
		).toBeGreaterThan(0);
	expect(
		previewImport(
			'medications',
			parseImportCsv(header + `${client},Synthetic med,1 mg,oral,,Follow order,`),
			context
		)[0].errors
	).toEqual([]);
});
