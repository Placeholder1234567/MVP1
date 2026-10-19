import { describe, expect, it } from 'vitest';
import { healthFlags, parseVitalLimits, VITAL_LIMITS, vitalFlags } from '../../../src/lib/domain';

describe('vitalFlags', () => {
	it('normal readings raise nothing', () => {
		expect(vitalFlags({ temp: 98.6, pulse: 72, sys: 120, dia: 80 })).toEqual([]);
		expect(vitalFlags({})).toEqual([]);
	});

	it('temperature flags at 100.4 and below 95 (MVP: >= high, < low)', () => {
		expect(vitalFlags({ temp: 100.4 })).toEqual(['temperature']);
		expect(vitalFlags({ temp: 100.3 })).toEqual([]);
		expect(vitalFlags({ temp: 94.9 })).toEqual(['temperature']);
		expect(vitalFlags({ temp: 95 })).toEqual([]);
	});

	it('pulse flags only above 100 or below 50', () => {
		expect(vitalFlags({ pulse: 100 })).toEqual([]);
		expect(vitalFlags({ pulse: 101 })).toEqual(['pulse']);
		expect(vitalFlags({ pulse: 49 })).toEqual(['pulse']);
	});

	it('blood pressure flags on either number', () => {
		expect(vitalFlags({ sys: 140, dia: 80 })).toEqual(['blood_pressure']);
		expect(vitalFlags({ sys: 120, dia: 90 })).toEqual(['blood_pressure']);
		expect(vitalFlags({ sys: 89 })).toEqual(['blood_pressure']);
		expect(vitalFlags({ sys: 139, dia: 89 })).toEqual([]);
	});
});

describe('parseVitalLimits', () => {
	it('uses the defaults when nothing is set', () => {
		expect(parseVitalLimits(null)).toEqual(VITAL_LIMITS);
		expect(parseVitalLimits('not json')).toEqual(VITAL_LIMITS);
	});
	it('takes a person’s own limits, from an object or device JSON text', () => {
		const own = parseVitalLimits({ sysLo: 80, sysHi: 120, diaLo: 50 });
		expect(own).toMatchObject({ sysLo: 80, sysHi: 120, diaLo: 50, diaHi: 90, tempHi: 100.4 });
		expect(parseVitalLimits('{"pulseHi":110}').pulseHi).toBe(110);
	});
	it('keeps the default pair when a limit is out of range or low is not below high', () => {
		const bad = parseVitalLimits({ tempLo: 101, tempHi: 100, pulseHi: 900, sysLo: 'x' });
		expect(bad).toEqual(VITAL_LIMITS);
	});
	it('changes what flags', () => {
		const low = parseVitalLimits({ sysLo: 80, sysHi: 120 });
		expect(healthFlags('vitals', { systolic: 125 })).toEqual([]);
		expect(healthFlags('vitals', { systolic: 125 }, low)).toEqual(['blood_pressure']);
		expect(healthFlags('vitals', { systolic: 85 }, low)).toEqual([]);
	});
});
