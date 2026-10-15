import { describe, expect, it } from 'vitest';
import { vitalFlags } from '../../../src/lib/domain';

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
