import { describe, expect, it } from 'vitest';
import {
	DEFAULT_INCIDENT_RULES,
	incidentNotifyRules,
	parseIncidentRules
} from '../../../src/lib/domain/charting';
import { missingNotifications } from '../../../src/lib/domain/clinical';

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
		expect(incidentNotifyRules('Medium', 'Fall', rules)).toEqual([
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
