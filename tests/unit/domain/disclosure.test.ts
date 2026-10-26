import { expect, it } from 'vitest';
import {
	accountingCsv,
	accountingFrom,
	incidentDisclosure,
	sortAccounting,
	type AccountingEntry
} from '../../../src/lib/domain/disclosure';

it('reaches back six years, including from a leap day', () => {
	expect(accountingFrom('2026-10-25')).toBe('2020-10-25');
	expect(accountingFrom('2028-02-29')).toBe('2022-03-01');
});

it('an incident sent to the state is an abuse report for abuse types, otherwise a state report', () => {
	expect(
		incidentDisclosure({ day: '2026-10-01', type: 'Suspected abuse or neglect', authorName: 'A' })
	).toMatchObject({
		purpose: 'abuse_report',
		source: 'incident',
		description: 'Incident report (Suspected abuse or neglect)'
	});
	expect(incidentDisclosure({ day: '2026-10-01', type: 'Fall', authorName: null }).purpose).toBe(
		'state_incident_report'
	);
});

const entry = (
	date: string,
	source: AccountingEntry['source'],
	recipient: string
): AccountingEntry => ({
	date,
	recipient,
	address: null,
	description: 'Synthetic',
	purpose: 'court',
	detail: null,
	source,
	recordedBy: 'Sam'
});

it('lists newest first and neutralizes spreadsheet formulas', () => {
	const sorted = sortAccounting([
		entry('2026-01-01', 'recorded', 'Old'),
		entry('2026-05-01', 'incident', 'B'),
		entry('2026-05-01', 'recorded', 'A')
	]);
	expect(sorted.map((e) => e.recipient)).toEqual(['A', 'B', 'Old']);
	const csv = accountingCsv('Person', '2020-10-25', '2026-10-25', [
		entry('2026-05-01', 'recorded', '=HYPERLINK("x")')
	]);
	expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
	expect(csv).toContain('"Court order or subpoena"');
});
