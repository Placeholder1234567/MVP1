import { describe, expect, it } from 'vitest';
import {
	DEFAULT_INCIDENT_RULES,
	incidentBoardText,
	incidentNotifyRules,
	mandatedReportNotice,
	parseIncidentRules
} from '../../../src/lib/domain/charting';
import { missingNotifications, overdueContacts } from '../../../src/lib/domain/clinical';

const custom = {
	incident_rules: {
		guardianWhen: 'Within 12 hours',
		nurseTypes: ['Seizure'],
		nurseWhen: 'Within 1 hour',
		stateSeverities: ['Medium', 'High'],
		stateTypes: [],
		stateWhen: 'Within 24 hours (state portal)'
	}
};

describe('parseIncidentRules', () => {
	it('falls back to the defaults when nothing is saved', () => {
		expect(parseIncidentRules({})).toEqual(DEFAULT_INCIDENT_RULES);
		expect(parseIncidentRules(null)).toEqual(DEFAULT_INCIDENT_RULES);
		expect(parseIncidentRules('not json')).toEqual(DEFAULT_INCIDENT_RULES);
	});

	it('reads saved rules, from synced JSON text too', () => {
		expect(parseIncidentRules(JSON.stringify(custom))).toMatchObject(custom.incident_rules);
	});

	it('keeps the default for a missing or invalid part and drops unknown values', () => {
		const r = parseIncidentRules({
			incident_rules: { guardianWhen: '  ', nurseTypes: ['Seizure', 'Sneeze'], stateWhen: 7 }
		});
		expect(r.guardianWhen).toBe(DEFAULT_INCIDENT_RULES.guardianWhen);
		expect(r.nurseTypes).toEqual(['Seizure']);
		expect(r.stateWhen).toBe(DEFAULT_INCIDENT_RULES.stateWhen);
		expect(r.stateTypes).toEqual(DEFAULT_INCIDENT_RULES.stateTypes);
	});
});

describe('incidentNotifyRules with agency rules', () => {
	const rules = parseIncidentRules(custom);
	it('applies the agency’s contacts and deadlines', () => {
		expect(
			incidentNotifyRules('Medium', 'Fall', rules).map(({ who, when }) => ({ who, when }))
		).toEqual([
			{ who: 'Supervisor', when: 'Right away' },
			{ who: 'Family or guardian', when: 'Within 12 hours' },
			{ who: 'State reporting system', when: 'Within 24 hours (state portal)' }
		]);
		expect(incidentNotifyRules('Low', 'Seizure', rules).map((r) => r.who)).toEqual([
			'Supervisor',
			'Family or guardian',
			'Nurse'
		]);
	});

	it('keeps the MVP placeholder rules by default', () => {
		expect(incidentNotifyRules('Low', 'Left without staff').map((r) => r.who)).toContain(
			'State reporting system'
		);
	});

	it('drives what the attention queue reports as not yet told', () => {
		expect(missingNotifications('Medium', 'Fall', ['Family or guardian'], rules)).toEqual([
			'State reporting system'
		]);
		expect(missingNotifications('Medium', 'Fall', ['Family or guardian'])).toEqual(['Nurse']);
	});
});

describe('overdueContacts', () => {
	const occurred = new Date('2026-10-18T10:00:00Z');
	const at = (h: number) => new Date(occurred.getTime() + h * 3_600_000);

	it('is due once each contact’s reminder hours pass without it marked as told', () => {
		expect(overdueContacts('Medium', 'Fall', [], occurred, at(1))).toEqual([]);
		expect(overdueContacts('Medium', 'Fall', [], occurred, at(3)).map((c) => c.who)).toEqual([
			'Nurse'
		]);
		expect(
			overdueContacts('Medium', 'Fall', ['Nurse'], occurred, at(25)).map((c) => c.who)
		).toEqual(['Family or guardian']);
		// The state has no reminder hours by default.
		expect(overdueContacts('High', 'Other', ['Family or guardian'], occurred, at(500))).toEqual([]);
	});

	it('uses the agency’s hours, and none switches a reminder off', () => {
		const rules = parseIncidentRules({
			incident_rules: { ...custom.incident_rules, guardianHours: null, stateHours: 12 }
		});
		expect(rules).toMatchObject({ guardianHours: null, nurseHours: 2, stateHours: 12 });
		expect(overdueContacts('High', 'Fall', [], occurred, at(13), rules)).toEqual([
			{
				who: 'State reporting system',
				when: 'Within 24 hours (state portal)',
				dueAt: at(12)
			}
		]);
		expect(parseIncidentRules({ incident_rules: { guardianHours: 0.5 } }).guardianHours).toBe(24);
	});
});

describe('critical incidents', () => {
	it('send abuse, exploitation and death to the state by default', () => {
		for (const type of ['Suspected abuse or neglect', 'Suspected exploitation', 'Death'] as const)
			expect(incidentNotifyRules('Low', type).map((r) => r.who)).toContain(
				'State reporting system'
			);
	});
	it('remind staff of their own duty to report, with the agency hotline when set', () => {
		expect(mandatedReportNotice('Fall', DEFAULT_INCIDENT_RULES)).toBeNull();
		expect(mandatedReportNotice('Death', DEFAULT_INCIDENT_RULES)).toBeNull();
		const generic = mandatedReportNotice('Suspected abuse or neglect', DEFAULT_INCIDENT_RULES);
		expect(generic).toMatch(/call 911/);
		expect(generic).toMatch(/Ask your supervisor for the number/);
		const rules = parseIncidentRules({
			incident_rules: { abuseHotline: '  APS 1-800-555-0100 ' }
		});
		expect(rules.abuseHotline).toBe('APS 1-800-555-0100');
		expect(mandatedReportNotice('Suspected exploitation', rules)).toMatch(
			'Report it yourself too: APS 1-800-555-0100.'
		);
	});
});

describe('incidentBoardText', () => {
	it('names the reporter by first name, the type and severity, never the person', () => {
		expect(incidentBoardText('Cara Giver', 'Fall', 'High')).toBe(
			'Cara reported an incident (fall, high severity). A supervisor will follow up.'
		);
	});
	it('stays off the board for abuse, neglect, exploitation and death', () => {
		for (const type of ['Suspected abuse or neglect', 'Suspected exploitation', 'Death'] as const)
			expect(incidentBoardText('Cara Giver', type, 'High')).toBeNull();
	});
});
