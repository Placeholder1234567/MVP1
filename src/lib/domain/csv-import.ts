export const CSV_LIMITS = { bytes: 262144, rows: 100, field: 4000, columns: 16 } as const;
export class CsvImportError extends Error {}
export type ImportKind = 'people' | 'goals' | 'medications' | 'staff';
export const IMPORT_HEADERS = {
	staff: ['email', 'name', 'role', 'home_ids', 'med_certified'],
	people: ['home_id', 'name', 'first_name', 'info'],
	goals: ['client_id', 'area', 'text', 'frequency', 'target'],
	medications: [
		'client_id',
		'name',
		'dose',
		'route',
		'scheduled_times',
		'prn_instructions',
		'notes'
	]
} as const;
export interface CsvRecord {
	line: number;
	cells: string[];
}
export interface ParsedCsv {
	headers: string[];
	rows: CsvRecord[];
}
/** RFC-style comma CSV, with bounded work and errors that never quote imported values. */
export function parseImportCsv(input: string): ParsedCsv {
	let bytes = 0;
	if (input.length > CSV_LIMITS.bytes)
		throw new CsvImportError('Use a CSV file no larger than 256 KB.');
	for (const char of input) {
		const point = char.codePointAt(0)!;
		bytes += point < 128 ? 1 : point < 2048 ? 2 : point < 65536 ? 3 : 4;
	}
	if (bytes > CSV_LIMITS.bytes) throw new CsvImportError('Use a CSV file no larger than 256 KB.');
	if (input.includes('\0')) throw new CsvImportError('The CSV contains an unsupported character.');
	input = input.replace(/^\uFEFF/, '');
	const records: CsvRecord[] = [];
	let cells: string[] = [],
		field = '',
		mode: 'start' | 'plain' | 'quoted' | 'closed' = 'start',
		line = 1,
		start = 1;
	function cell() {
		cells.push(field);
		field = '';
		mode = 'start';
		if (cells.length > CSV_LIMITS.columns)
			throw new CsvImportError('The CSV has too many columns.');
	}
	function row() {
		cell();
		if (cells.some((value) => value.trim())) records.push({ line: start, cells });
		cells = [];
		if (records.length > CSV_LIMITS.rows + 1)
			throw new CsvImportError('Use at most 100 data rows per import.');
	}
	for (let i = 0; i < input.length; i++) {
		const char = input[i];
		if (mode === 'quoted') {
			if (char === '"') {
				if (input[i + 1] === '"') {
					field += '"';
					i++;
				} else mode = 'closed';
			} else if (char === '\r' || char === '\n') {
				if (char === '\r' && input[i + 1] === '\n') i++;
				field += '\n';
				line++;
			} else field += char;
		} else if (char === ',') cell();
		else if (char === '\n' || char === '\r') {
			row();
			if (char === '\r' && input[i + 1] === '\n') i++;
			line++;
			start = line;
		} else if (char === '"' && mode === 'start') mode = 'quoted';
		else if (char === '"' || mode === 'closed')
			throw new CsvImportError(`Check CSV quoting near line ${line}.`);
		else {
			field += char;
			mode = 'plain';
		}
		if (field.length > CSV_LIMITS.field)
			throw new CsvImportError(`A field near line ${line} exceeds 4,000 characters.`);
	}
	if (mode === 'quoted') throw new CsvImportError('A quoted CSV field is not closed.');
	if (field || cells.length || mode === 'closed') row();
	const first = records.shift();
	if (!first) throw new CsvImportError('Add a header and at least one data row.');
	const headers = first.cells.map((value) => value.trim().toLowerCase());
	if (headers.some((value) => !value) || new Set(headers).size !== headers.length)
		throw new CsvImportError('Use unique, nonempty column headers.');
	if (!records.length) throw new CsvImportError('Add at least one data row below the header.');
	return { headers, rows: records };
}
export type ImportPayload =
	| {
			kind: 'staff';
			input: {
				email: string;
				name: string;
				role: 'caregiver' | 'supervisor';
				homeIds: string[];
				medCertified: boolean;
			};
	  }
	| { kind: 'people'; input: { homeId: string; name: string; firstName?: string; info?: string } }
	| {
			kind: 'goals';
			input: { clientId: string; area: string; text: string; frequency?: string; target?: string };
	  }
	| {
			kind: 'medications';
			input: {
				clientId: string;
				name: string;
				dose?: string;
				route?: string;
				scheduledTimes: string[];
				prnInstructions?: string;
				notes?: string;
			};
	  };
export interface ImportContext {
	homes: Array<{ id: string; name: string }>;
	people: Array<{ id: string; name: string; homeId: string | null; active: boolean }>;
	existingKeys?: readonly string[];
}
export interface ImportPreviewRow {
	line: number;
	values: string[];
	target: string;
	errors: string[];
	payload: ImportPayload;
	key: string;
}
export function importKey(
	kind: ImportKind,
	values: readonly (string | null | undefined)[]
): string {
	return JSON.stringify([kind, ...values.map((value) => value?.trim().toLowerCase() ?? '')]);
}
export function previewImport(
	kind: ImportKind,
	csv: ParsedCsv,
	context: ImportContext
): ImportPreviewRow[] {
	const expected: readonly string[] = IMPORT_HEADERS[kind];
	if (
		csv.headers.length !== expected.length ||
		expected.some((header) => !csv.headers.includes(header))
	)
		throw new CsvImportError(`Use exactly these headers: ${expected.join(', ')}.`);
	const seen = new Set<string>();
	const existing = new Set(context.existingKeys ?? []);
	if (kind === 'people')
		for (const person of context.people)
			existing.add(importKey(kind, [person.homeId, person.name]));
	return csv.rows.map((record) => {
		const errors: string[] = [];
		if (record.cells.length !== csv.headers.length)
			errors.push('The number of fields does not match the header.');
		const value = (header: string) => (record.cells[csv.headers.indexOf(header)] ?? '').trim();
		const bounded = (header: string, max: number, required = false) => {
			const text = value(header);
			if (required && !text) errors.push(`${header} is required.`);
			if (text.length > max) errors.push(`${header} is too long (maximum ${max}).`);
			return text;
		};
		const id = value(kind === 'people' ? 'home_id' : 'client_id').toLowerCase();
		const home = context.homes.find((item) => item.id === id);
		const person = context.people.find((item) => item.id === id && item.active);
		if (kind !== 'staff' && (kind === 'people' ? !home : !person))
			errors.push(
				kind === 'people'
					? 'home_id must identify an accessible home.'
					: 'client_id must identify an accessible active person.'
			);
		let payload: ImportPayload, key: string;
		let staffTarget = '';
		if (kind === 'staff') {
			const email = bounded('email', 254, true).toLowerCase();
			const name = bounded('name', 100, true);
			const role = value('role');
			const certified = value('med_certified').toLowerCase();
			const homeIds = value('home_ids')
				? value('home_ids')
						.toLowerCase()
						.split(';')
						.map((id) => id.trim())
				: [];
			// Match the existing invitation API's email format without a runtime dependency.
			if (
				!/^(?:[A-Za-z0-9_'+-]+\.)*[A-Za-z0-9_'+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/.test(
					email
				)
			)
				errors.push('email must be a valid email address.');
			if (role !== 'caregiver' && role !== 'supervisor')
				errors.push('role must be caregiver or supervisor. Invite administrators individually.');
			if (certified !== 'true' && certified !== 'false')
				errors.push('med_certified must be true or false.');
			if (
				!homeIds.length ||
				homeIds.length > 50 ||
				new Set(homeIds).size !== homeIds.length ||
				homeIds.some((id) => !context.homes.some((home) => home.id === id))
			)
				errors.push(
					'home_ids must contain 1–50 distinct accessible home IDs separated by semicolons.'
				);
			staffTarget = homeIds
				.map((id) => context.homes.find((home) => home.id === id)?.name ?? 'Unresolved home')
				.join('; ');
			payload = {
				kind,
				input: {
					email,
					name,
					role: role === 'supervisor' ? 'supervisor' : 'caregiver',
					homeIds,
					medCertified: certified === 'true'
				}
			};
			key = importKey(kind, [email]);
		} else if (kind === 'people') {
			const name = bounded('name', 100, true),
				firstName = bounded('first_name', 50),
				info = bounded('info', 4000);
			payload = {
				kind,
				input: { homeId: id, name, firstName: firstName || undefined, info: info || undefined }
			};
			key = importKey(kind, [id, name]);
		} else if (kind === 'goals') {
			const area = bounded('area', 120, true),
				text = bounded('text', 2000, true),
				frequency = bounded('frequency', 200),
				target = bounded('target', 500);
			payload = {
				kind,
				input: {
					clientId: id,
					area,
					text,
					frequency: frequency || undefined,
					target: target || undefined
				}
			};
			key = importKey(kind, [id, area, text]);
		} else {
			const name = bounded('name', 200, true),
				dose = bounded('dose', 200),
				route = bounded('route', 100),
				prn = bounded('prn_instructions', 2000),
				notes = bounded('notes', 4000);
			const times = value('scheduled_times')
				? value('scheduled_times')
						.split(';')
						.map((time) => time.trim())
				: [];
			if (
				times.length > 24 ||
				times.some((time) => !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) ||
				new Set(times).size !== times.length
			)
				errors.push(
					'scheduled_times must contain distinct HH:MM times separated by semicolons (maximum 24).'
				);
			if ((!times.length && !prn) || (times.length && prn))
				errors.push('Choose scheduled_times or prn_instructions, not both.');
			payload = {
				kind,
				input: {
					clientId: id,
					name,
					dose: dose || undefined,
					route: route || undefined,
					scheduledTimes: times,
					prnInstructions: prn || undefined,
					notes: notes || undefined
				}
			};
			key = importKey(kind, [id, name, dose, route]);
		}
		if (seen.has(key)) errors.push('Possible duplicate within this CSV.');
		if (existing.has(key)) errors.push('Possible duplicate of an existing record.');
		seen.add(key);
		return {
			line: record.line,
			values: expected.map((header) => value(header)),
			target:
				kind === 'staff'
					? staffTarget
					: kind === 'people'
						? (home?.name ?? 'Unresolved home')
						: person
							? `${person.name} · ${context.homes.find((item) => item.id === person.homeId)?.name ?? 'Home'}`
							: 'Unresolved person',
			errors,
			payload,
			key
		};
	});
}
