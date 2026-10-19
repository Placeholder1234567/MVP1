import { describe, expect, it } from 'vitest';
import {
	HEALTH_FIELDS,
	healthFlags,
	healthPayload,
	healthReading,
	healthSummary,
	vitalFieldWarning
} from '../../../src/lib/domain/clinical';
import { parseHealthData, NewHealthEntry } from '../../../src/lib/server/services/health';
import { VITAL_LIMITS } from '../../../src/lib/domain/vitals';

describe('entered expanded health readings', () => {
	it('preserves explicit finite decimal readings and identifies their units', () => {
		const fields = { respiration: '12.5', oxygen: '97.2', glucose: '104', pulse: '' };
		const device = healthPayload('vitals', fields);
		expect(device).toEqual({ ok: true, data: { respiration: 12.5, oxygen: 97.2, glucose: 104 } });
		expect(parseHealthData('vitals', fields)).toEqual({
			respiration: 12.5,
			oxygen: 97.2,
			glucose: 104
		});
		expect(healthSummary('vitals', fields)).toContain('Respiratory rate 12.5 breaths/min');
		expect(healthSummary('vitals', fields)).toContain('SpO2 97.2%');
		expect(healthSummary('vitals', fields)).toContain('Blood glucose 104 mg/dL');
	});
	it('bounds input without inventing clinical limits or converting blanks/booleans into readings', () => {
		for (const [key, max] of [
			['respiration', 1000],
			['oxygen', 100]
		] as const) {
			for (const value of [0, max]) {
				expect(healthReading(key, value)).toEqual({ ok: true, value });
				expect(parseHealthData('vitals', { [key]: value })).toEqual({ [key]: value });
				expect(healthFlags('vitals', { [key]: value })).toEqual([]);
				expect(vitalFieldWarning(key, value)).toBeNull();
			}
			for (const value of [-1, max + 0.1, Infinity, NaN, true, false, [], [1], {}, '0x10', '1e2']) {
				expect(healthReading(key, value).ok).toBe(false);
				expect(() => parseHealthData('vitals', { [key]: value })).toThrow();
			}
			for (const value of ['', ' ', null, undefined])
				expect(healthReading(key, value)).toEqual({ ok: true, value: undefined });
		}
		expect(parseHealthData('vitals', { oxygen: '', pulse: 70 })).toEqual({ pulse: 70 });
		expect(() => parseHealthData('vitals', { oxygen: '', respiration: null })).toThrow();
		expect(healthPayload('vitals', { pulse: 70, oxygen: [] as unknown as string }).ok).toBe(false);
		expect(healthSummary('vitals', { respiration: 0, oxygen: 0, glucose: 0 })).toBe(
			'Respiratory rate 0 breaths/min · SpO2 0% · Blood glucose 0 mg/dL'
		);
		expect(
			HEALTH_FIELDS.vitals
				.filter((field) => field.alertConfigured === false)
				.map((field) => field.key)
		).toEqual(['respiration', 'oxygen']);
	});
	it('flags blood glucose at 250 or above or below 70, and a 5 lb weight change', () => {
		expect(healthFlags('vitals', { glucose: 249 })).toEqual([]);
		expect(healthFlags('vitals', { glucose: 250 })).toEqual(['glucose']);
		expect(healthFlags('vitals', { glucose: 70 })).toEqual([]);
		expect(healthFlags('vitals', { glucose: 69.9 })).toEqual(['glucose']);
		expect(vitalFieldWarning('glucose', 300)).toBe('Blood glucose is outside the normal range.');
		// A person's own range, set by a nurse.
		const own = { ...VITAL_LIMITS, glucoseHi: 180 };
		expect(healthFlags('vitals', { glucose: 200 }, own)).toEqual(['glucose']);

		expect(healthFlags('vitals', { weight: 150 }, VITAL_LIMITS, 154.9)).toEqual([]);
		expect(healthFlags('vitals', { weight: 150 }, VITAL_LIMITS, 155)).toEqual(['weight_change']);
		expect(healthFlags('vitals', { weight: 150 })).toEqual([]);
		expect(vitalFieldWarning('weight', 160, VITAL_LIMITS, 150)).toBe(
			'That is 5 lb or more from the last weight (150 lb).'
		);
		expect(vitalFieldWarning('weight', 152, VITAL_LIMITS, 150)).toBeNull();
	});
	it('keeps existing clinical alert operators and boundaries unchanged', () => {
		for (const [key, normal, alert] of [
			['temp', 95, 94.9],
			['pulse', 50, 49.9],
			['systolic', 90, 89.9],
			['diastolic', 60, 59.9]
		] as const) {
			expect(healthFlags('vitals', { [key]: normal })).toEqual([]);
			expect(healthFlags('vitals', { [key]: alert })).not.toEqual([]);
		}
		expect(healthFlags('vitals', { temp: 100.4, systolic: 140, diastolic: 90 })).toEqual([
			'temperature',
			'blood_pressure'
		]);
		expect(healthFlags('vitals', { pulse: 100 })).toEqual([]);
		expect(healthFlags('vitals', { pulse: 100.1 })).toEqual(['pulse']);
	});
});

describe('explicit bowel observations', () => {
	it('requires a human status and retains observations without inferring absence or readings', () => {
		for (const status of ['Observed', 'Not observed', 'Declined']) {
			const fields = { status, time: '09:30', notes: 'Synthetic observation' };
			expect(healthPayload('bowel', fields)).toEqual({ ok: true, data: fields });
			expect(parseHealthData('bowel', fields)).toEqual(fields);
			expect(healthFlags('bowel', fields)).toEqual([]);
		}
		expect(healthPayload('bowel', {}).ok).toBe(false);
		for (const input of [
			{},
			{ status: 'Unknown' },
			{ status: 'Not observed', consistency: 'Recorded incorrectly' },
			{ status: 'Observed', time: '25:61' },
			{ status: 'Observed', notes: 'x'.repeat(1001) }
		]) {
			expect(healthPayload('bowel', input).ok).toBe(false);
			expect(() => parseHealthData('bowel', input)).toThrow();
		}
		expect(
			healthSummary('bowel', {
				status: 'Observed',
				time: '09:30',
				consistency: 'Human description'
			})
		).toBe('Observed · 09:30 · Human description');
	});
	it('does not reflect malformed JSON or field content in parsing errors', () => {
		const marker = 'SYNTHETIC-PRIVATE-INPUT';
		const result = NewHealthEntry.safeParse({
			id: crypto.randomUUID(),
			clientId: crypto.randomUUID(),
			kind: 'bowel',
			data: `{${marker}`
		});
		expect(result.success).toBe(false);
		if (!result.success) expect(String(result.error)).not.toContain(marker);
		expect(() => parseHealthData('bowel', { status: 'Observed', [marker]: 'Synthetic' })).toThrow(
			/^Check the health entry fields$/
		);
	});
});
