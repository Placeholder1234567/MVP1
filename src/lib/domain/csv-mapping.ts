// Column mapping for CSV imports (charting-guide.md "4a. CSV Import Wizard",
// "4c. Therap column presets"; frontend-spec-3.md item 18). A file exported
// from another system, or typed from the downloadable template, has columns
// like "Last Name", "Date of Birth" or "Home Assignments". These are
// recognized and turned into Guad's own columns before the usual preview,
// so every row still goes through the same checks (csv-import.ts). Home and
// person names become IDs; dates, times and yes/no values are normalized.
// Nothing here is guessed silently: each mapping is listed for review, and a
// value that can't be resolved stays as typed so the preview flags it.
import {
	IMPORT_EXTRA_HEADERS,
	IMPORT_HEADERS,
	type ImportContext,
	type ImportKind,
	type ParsedCsv
} from './csv-import';

/** "Date of Birth" → "dateofbirth" */
const norm = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, '');

type Source = { field: string; names: string[] };

/** Recognized column names for each source field, normalized. */
const SOURCES: Record<ImportKind, Source[]> = {
	people: [
		{ field: 'name', names: ['name', 'fullname', 'individualname', 'clientname', 'individual'] },
		{ field: 'first', names: ['firstname', 'first', 'givenname'] },
		{ field: 'last', names: ['lastname', 'last', 'surname', 'familyname'] },
		{ field: 'preferred', names: ['preferredname', 'nickname', 'goesby'] },
		{
			field: 'home',
			names: ['home', 'homename', 'site', 'program', 'residence', 'house', 'location']
		},
		{ field: 'info', names: ['info', 'notes', 'comments', 'whatstaffshouldknow'] },
		{ field: 'dob', names: ['dob', 'dateofbirth', 'birthdate', 'birthday'] },
		{ field: 'guardian', names: ['guardian', 'guardianname', 'emergencycontact', 'contact'] },
		{ field: 'phone', names: ['phone', 'guardianphone', 'contactphone', 'phonenumber'] },
		{ field: 'allergies', names: ['allergies', 'allergy'] },
		{ field: 'conditions', names: ['conditions', 'diagnoses', 'diagnosis', 'medicalconditions'] },
		{ field: 'diet', names: ['diet', 'dietaryrestrictions', 'dietorder', 'dietary'] },
		{ field: 'doctor', names: ['doctor', 'physician', 'primarycarephysician', 'pcp'] }
	],
	medications: [
		{
			field: 'person',
			names: ['individual', 'individualname', 'client', 'clientname', 'person', 'resident']
		},
		{ field: 'name', names: ['medname', 'medication', 'medicationname', 'drug', 'drugname'] },
		{ field: 'dose', names: ['dose', 'dosage', 'strength'] },
		{ field: 'route', names: ['route'] },
		{ field: 'times', names: ['time', 'times', 'administrationtimes', 'medtime', 'medtimes'] },
		{ field: 'prn', names: ['prn', 'asneeded', 'prninstructions'] },
		{ field: 'frequency', names: ['frequency', 'schedule'] },
		{ field: 'prescriber', names: ['prescriber', 'prescribedby', 'physician'] },
		{ field: 'notes', names: ['notes', 'instructions', 'comments'] }
	],
	goals: [
		{
			field: 'person',
			names: ['individual', 'individualname', 'client', 'clientname', 'person', 'resident']
		},
		{ field: 'area', names: ['area', 'goalarea', 'domain', 'category', 'outcome'] },
		{ field: 'text', names: ['goaltext', 'goal', 'goaldescription', 'objective', 'text'] },
		{ field: 'method', names: ['measurementmethod', 'method', 'datacollection', 'frequency'] },
		{ field: 'target', names: ['target', 'criteria', 'masterycriteria'] },
		{ field: 'baseline', names: ['currentbaseline', 'baseline'] }
	],
	staff: [
		{ field: 'email', names: ['email', 'emailaddress', 'workemail'] },
		{ field: 'name', names: ['name', 'fullname', 'staffname', 'employeename'] },
		{ field: 'first', names: ['firstname', 'first'] },
		{ field: 'last', names: ['lastname', 'last', 'surname'] },
		{ field: 'role', names: ['role', 'position', 'jobtitle', 'title'] },
		{
			field: 'homes',
			names: ['homeassignments', 'homes', 'home', 'sites', 'programs', 'assignedhomes']
		},
		{
			field: 'certified',
			names: ['medcertified', 'medicationcertified', 'medcert', 'certified', 'medpassed']
		}
	]
};

/** What each source field means, for the review list. */
const LABELS: Record<string, string> = {
	name: 'Name',
	first: 'First name',
	last: 'Last name',
	preferred: 'Preferred name',
	home: 'Home',
	info: 'What staff should know',
	dob: 'Date of birth',
	guardian: 'Guardian or contact',
	phone: 'Contact phone (added to guardian)',
	allergies: 'Allergies',
	conditions: 'Conditions',
	diet: 'Diet',
	doctor: 'Doctor',
	person: 'Person',
	dose: 'Dose',
	route: 'Route',
	times: 'Scheduled times',
	prn: 'As needed (PRN)',
	frequency: 'Frequency (added to notes)',
	prescriber: 'Prescriber (added to notes)',
	notes: 'Notes',
	area: 'Goal area',
	text: 'Goal wording',
	method: 'How it is measured',
	target: 'Target',
	baseline: 'Baseline (added to target)',
	email: 'Email',
	role: 'Role',
	homes: 'Homes',
	certified: 'Medication certified'
};

/** Downloadable templates with common column names (charting-guide.md 4b). */
export const COMMON_TEMPLATES: Record<ImportKind, string[]> = {
	people: [
		'Last Name',
		'First Name',
		'Home',
		'DOB',
		'Guardian',
		'Phone',
		'Allergies',
		'Conditions',
		'Diet',
		'Doctor'
	],
	medications: [
		'Individual',
		'Med Name',
		'Dose',
		'Route',
		'Frequency',
		'Time',
		'PRN',
		'Prescriber'
	],
	goals: [
		'Individual',
		'Goal Area',
		'Goal Text',
		'Measurement Method',
		'Target',
		'Current Baseline'
	],
	staff: ['Name', 'Email', 'Role', 'Med Certified', 'Home Assignments']
};

export interface ColumnMapping {
	/** The file's column, as written */
	from: string;
	/** What Guad reads it as */
	to: string;
}

export interface AdaptedCsv {
	csv: ParsedCsv;
	/** How the file's columns were read; empty when the file already used Guad's columns */
	mapping: ColumnMapping[];
	/** Columns that were not recognized and are left out */
	ignored: string[];
	/** Problems found while resolving names, dates and times, by line */
	issues: Map<number, string[]>;
}

/** M/D/YYYY, MM-DD-YYYY or YYYY-MM-DD as YYYY-MM-DD, or null. */
export function isoDate(value: string): string | null {
	const v = value.trim();
	let y: number, m: number, d: number;
	const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v);
	const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
	if (us) [m, d, y] = [Number(us[1]), Number(us[2]), Number(us[3])];
	else if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
	else return null;
	const out = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
	const check = new Date(`${out}T00:00:00Z`);
	return !Number.isNaN(check.getTime()) && check.toISOString().slice(0, 10) === out ? out : null;
}

/** "8:00 AM, 8 PM; 14:30" as ["08:00", "20:00", "14:30"], or null if any part isn't a time. */
export function clockTimes(value: string): string[] | null {
	const parts = value
		.split(/[;,|]|\s+and\s+/i)
		.map((p) => p.trim())
		.filter(Boolean);
	const out: string[] = [];
	for (const part of parts) {
		const t = /^(\d{1,2})(?::?(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/i.exec(part);
		if (!t) return null;
		let h = Number(t[1]);
		const min = Number(t[2] ?? '0');
		const half = t[3]?.toLowerCase().startsWith('p') ? 'pm' : t[3] ? 'am' : null;
		if (half && (h < 1 || h > 12)) return null;
		if (half === 'pm' && h !== 12) h += 12;
		if (half === 'am' && h === 12) h = 0;
		if (h > 23 || min > 59) return null;
		out.push(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`);
	}
	return out;
}

const YES = new Set(['yes', 'y', 'true', '1', 'x']);
const NO = new Set(['no', 'n', 'false', '0', '']);

/** Role words from other systems as Guad roles, or the value as typed. */
function staffRole(value: string) {
	const v = value.trim().toLowerCase();
	if (/supervis|manager|coordinator|lead|director/.test(v)) return 'supervisor';
	if (/caregiver|dsp|direct support|staff|aide|support worker|associate/.test(v))
		return 'caregiver';
	return v;
}

/**
 * Reads a file in common or Therap-style columns as Guad's columns. A file
 * that already has every required Guad column is returned unchanged.
 */
export function adaptImportCsv(
	kind: ImportKind,
	csv: ParsedCsv,
	context: ImportContext
): AdaptedCsv {
	const required: readonly string[] = IMPORT_HEADERS[kind];
	const extra: readonly string[] = IMPORT_EXTRA_HEADERS[kind];
	const issues = new Map<number, string[]>();
	if (required.every((h) => csv.headers.includes(h)))
		return { csv, mapping: [], ignored: [], issues };

	// Each source field takes the first column that matches one of its names.
	const column = new Map<string, number>();
	const used = new Set<number>();
	for (const source of SOURCES[kind]) {
		const index = csv.headers.findIndex((h, i) => !used.has(i) && source.names.includes(norm(h)));
		if (index >= 0) {
			column.set(source.field, index);
			used.add(index);
		}
	}
	// Guad's own column names still count (a file mixing both).
	const own = (h: string) => csv.headers.indexOf(h);
	const mapping: ColumnMapping[] = [...column].map(([field, i]) => ({
		from: csv.headers[i],
		to: LABELS[field] ?? field
	}));
	const ignored = csv.headers.filter(
		(h, i) => !used.has(i) && !required.includes(h) && !extra.includes(h)
	);
	const note = (line: number, text: string) =>
		issues.set(line, [...(issues.get(line) ?? []), text]);
	const byName = <T extends { name: string }>(list: T[], name: string) => {
		const n = name.trim().toLowerCase();
		return list.filter((item) => item.name.trim().toLowerCase() === n);
	};

	const headers = [...required, ...extra.filter((h) => own(h) >= 0 || kind === 'people')];
	const rows = csv.rows.map((record) => {
		const get = (field: string) => {
			const i = column.get(field);
			return i === undefined ? '' : (record.cells[i] ?? '').trim();
		};
		const keep = (h: string) => (own(h) >= 0 ? (record.cells[own(h)] ?? '').trim() : '');
		const out: Record<string, string> = {};
		const personId = () => {
			const typed = get('person');
			if (!typed) return keep('client_id');
			const found = byName(
				context.people.filter((p) => p.active),
				typed
			);
			if (found.length === 1) return found[0].id;
			note(
				record.line,
				found.length
					? `More than one person is called "${typed}"; use client_id for this row.`
					: `No active person called "${typed}" in your homes.`
			);
			return typed;
		};
		if (kind === 'people') {
			const first = get('first');
			const name = get('name') || [first, get('last')].filter(Boolean).join(' ') || keep('name');
			out.name = name;
			out.first_name = get('preferred') || first || keep('first_name');
			const typedHome = get('home');
			if (typedHome) {
				const found = byName(context.homes, typedHome);
				if (found.length === 1) out.home_id = found[0].id;
				else {
					out.home_id = typedHome;
					note(record.line, `No home called "${typedHome}" (archived homes take no new people).`);
				}
			} else out.home_id = keep('home_id');
			out.info = get('info') || keep('info');
			const dob = get('dob') || keep('dob');
			out.dob = dob ? (isoDate(dob) ?? dob) : '';
			const phone = get('phone');
			const guardian = get('guardian') || keep('guardian');
			out.guardian = [guardian, phone && (guardian ? `(${phone})` : phone)]
				.filter(Boolean)
				.join(' ');
			for (const f of ['allergies', 'conditions', 'diet', 'doctor']) out[f] = get(f) || keep(f);
			out.behaviors = keep('behaviors');
		} else if (kind === 'medications') {
			out.client_id = personId();
			out.name = get('name') || keep('name');
			out.dose = get('dose') || keep('dose');
			out.route = get('route') || keep('route');
			const typedTimes = get('times');
			const times = typedTimes ? clockTimes(typedTimes) : null;
			if (typedTimes && !times)
				note(record.line, `Can't read "${typedTimes}" as times of day, e.g. 8:00 AM; 8 PM.`);
			out.scheduled_times = times ? times.join(';') : typedTimes || keep('scheduled_times');
			const prn = get('prn');
			out.prn_instructions = YES.has(prn.toLowerCase())
				? 'As needed'
				: NO.has(prn.toLowerCase())
					? keep('prn_instructions')
					: prn;
			out.notes = [
				get('notes') || keep('notes'),
				get('frequency') && `Frequency: ${get('frequency')}`,
				get('prescriber') && `Prescriber: ${get('prescriber')}`
			]
				.filter(Boolean)
				.join('; ');
		} else if (kind === 'goals') {
			out.client_id = personId();
			out.area = get('area') || keep('area');
			if (!out.area && column.has('text')) out.area = 'General';
			out.text = get('text') || keep('text');
			out.frequency = get('method') || keep('frequency');
			out.target = [
				get('target') || keep('target'),
				get('baseline') && `baseline: ${get('baseline')}`
			]
				.filter(Boolean)
				.join('; ');
			if (own('steps') >= 0) out.steps = keep('steps');
		} else {
			out.email = get('email') || keep('email');
			out.name =
				get('name') || [get('first'), get('last')].filter(Boolean).join(' ') || keep('name');
			out.role = column.has('role') ? staffRole(get('role')) : keep('role');
			const typedHomes = get('homes');
			if (typedHomes) {
				const ids = typedHomes
					.split(/[;,|]/)
					.map((h) => h.trim())
					.filter(Boolean)
					.map((h) => {
						const found = byName(context.homes, h);
						if (found.length === 1) return found[0].id;
						note(record.line, `No home called "${h}".`);
						return h;
					});
				out.home_ids = ids.join(';');
			} else out.home_ids = keep('home_ids');
			const cert = (get('certified') || keep('med_certified')).toLowerCase();
			out.med_certified = YES.has(cert) ? 'true' : NO.has(cert) ? 'false' : cert;
		}
		return { line: record.line, cells: headers.map((h) => out[h] ?? '') };
	});
	if (kind === 'goals' && !column.has('area') && own('area') < 0 && column.has('text'))
		mapping.push({ from: '(none)', to: 'Goal area: "General"' });
	return { csv: { headers, rows }, mapping, ignored, issues };
}
