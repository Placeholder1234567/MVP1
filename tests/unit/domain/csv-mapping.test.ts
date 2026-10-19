import { describe, expect, it } from 'vitest';
import { parseImportCsv, previewImport } from '../../../src/lib/domain/csv-import';
import { adaptImportCsv, clockTimes, isoDate } from '../../../src/lib/domain/csv-mapping';

const OAK = '11111111-1111-4111-8111-111111111111';
const ELM = '22222222-2222-4222-8222-222222222222';
const ROSA = '33333333-3333-4333-8333-333333333333';
const context = {
	homes: [
		{ id: OAK, name: 'Oak House' },
		{ id: ELM, name: 'Elm House' }
	],
	people: [
		{ id: ROSA, name: 'Rosa Synthetic', homeId: OAK, active: true },
		{
			id: '44444444-4444-4444-8444-444444444444',
			name: 'Twin Synthetic',
			homeId: OAK,
			active: true
		},
		{
			id: '55555555-5555-4555-8555-555555555555',
			name: 'Twin Synthetic',
			homeId: ELM,
			active: true
		}
	]
};
const read = (kind: Parameters<typeof adaptImportCsv>[0], text: string) => {
	const adapted = adaptImportCsv(kind, parseImportCsv(text), context);
	return { adapted, rows: previewImport(kind, adapted.csv, context) };
};

describe('values from other systems', () => {
	it('reads US and ISO dates, and 12- or 24-hour times', () => {
		expect(isoDate('3/7/1990')).toBe('1990-03-07');
		expect(isoDate('1990-3-7')).toBe('1990-03-07');
		expect(isoDate('2/30/1990')).toBeNull();
		expect(clockTimes('8:00 AM, 8 PM; 14:30')).toEqual(['08:00', '20:00', '14:30']);
		expect(clockTimes('12 am and 12pm')).toEqual(['00:00', '12:00']);
		expect(clockTimes('morning')).toBeNull();
		expect(clockTimes('13:00 PM')).toBeNull();
	});
});

describe('adaptImportCsv', () => {
	it('leaves a file in Guad columns unchanged', () => {
		const csv = parseImportCsv(`home_id,name,first_name,info\r\n${OAK},Ann Synthetic,,\r\n`);
		const adapted = adaptImportCsv('people', csv, context);
		expect(adapted.csv).toBe(csv);
		expect(adapted.mapping).toEqual([]);
	});

	it('reads a Therap-style people export: names, home by name, US dates, guardian phone', () => {
		const { adapted, rows } = read(
			'people',
			'Last Name,First Name,Home,DOB,Guardian,Phone,Allergies,Program Code\r\n' +
				'Synthetic,Ann,oak house,3/7/1990,Lee Synthetic,555-0100,Peanuts,X1\r\n' +
				'Synthetic,Bo,Pine House,1/1/1980,,,,X2\r\n'
		);
		expect(adapted.mapping.map((m) => `${m.from}→${m.to}`)).toContain('home→Home');
		expect(adapted.ignored).toEqual(['program code']);
		expect(rows[0].errors).toEqual([]);
		expect(rows[0].payload).toMatchObject({
			kind: 'people',
			input: {
				homeId: OAK,
				name: 'Ann Synthetic',
				firstName: 'Ann',
				healthInfo: {
					dob: '1990-03-07',
					guardian: 'Lee Synthetic (555-0100)',
					allergies: 'Peanuts'
				}
			}
		});
		// An unknown home stays as typed, so the preview refuses the row.
		expect(rows[1].errors.join(' ')).toMatch(/home_id/);
		expect(adapted.issues.get(rows[1].line)?.[0]).toMatch(/No home called "Pine House"/);
	});

	it('reads a medications export: person by name, times, PRN and notes', () => {
		const { adapted, rows } = read(
			'medications',
			'Individual,Med Name,Dose,Route,Frequency,Time,PRN,Prescriber\r\n' +
				'Rosa Synthetic,Synthetic A,10 mg,Oral,Twice daily,8:00 AM; 8:00 PM,No,Dr Synthetic\r\n' +
				'Rosa Synthetic,Synthetic B,5 mg,Oral,,,Yes,\r\n' +
				'Twin Synthetic,Synthetic C,1 mg,Oral,,9 AM,No,\r\n'
		);
		expect(rows[0].errors).toEqual([]);
		expect(rows[0].payload.input).toMatchObject({
			clientId: ROSA,
			name: 'Synthetic A',
			scheduledTimes: ['08:00', '20:00'],
			notes: 'Frequency: Twice daily; Prescriber: Dr Synthetic'
		});
		expect(rows[1].payload.input).toMatchObject({
			scheduledTimes: [],
			prnInstructions: 'As needed'
		});
		// Two people share the name: the row must say which.
		expect(rows[2].errors.length).toBeGreaterThan(0);
		expect(adapted.issues.get(rows[2].line)?.[0]).toMatch(/More than one person/);
	});

	it('reads goals and staff with common column names', () => {
		const goals = read(
			'goals',
			'Individual,Goal Text,Measurement Method,Target,Current Baseline\r\n' +
				'Rosa Synthetic,Make a sandwich,Per trial,80%,40%\r\n'
		);
		expect(goals.rows[0].errors).toEqual([]);
		expect(goals.rows[0].payload.input).toMatchObject({
			clientId: ROSA,
			area: 'General',
			text: 'Make a sandwich',
			frequency: 'Per trial',
			target: '80%; baseline: 40%'
		});
		const staff = read(
			'staff',
			'Name,Email,Role,Med Certified,Home Assignments\r\n' +
				'Dee Synthetic,dee@example.test,DSP,Yes,Oak House; Elm House\r\n' +
				'Sam Synthetic,sam@example.test,House Manager,N,Oak House\r\n'
		);
		expect(staff.rows.map((r) => r.errors)).toEqual([[], []]);
		expect(staff.rows[0].payload.input).toMatchObject({
			role: 'caregiver',
			medCertified: true,
			homeIds: [OAK, ELM]
		});
		expect(staff.rows[1].payload.input).toMatchObject({ role: 'supervisor', medCertified: false });
	});
});
