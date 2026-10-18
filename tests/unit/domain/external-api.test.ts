import { describe, expect, it } from 'vitest';
import {
	ApiInputError,
	boolParam,
	dateRange,
	instantParam,
	intParam,
	uuidParam
} from '../../../src/lib/domain/external-api';

describe('dateRange', () => {
	it('accepts ordered days and optional ends', () => {
		expect(dateRange('2026-03-01', '2026-03-31', true)).toEqual({
			from: '2026-03-01',
			to: '2026-03-31'
		});
		expect(dateRange(null, null, false)).toEqual({ from: null, to: null });
	});
	it('rejects missing, malformed, reversed and over-long ranges', () => {
		expect(() => dateRange('2026-03-01', null, true)).toThrow("'from' and 'to' are required");
		expect(() => dateRange('2026-3-1', '2026-03-31', true)).toThrow(ApiInputError);
		expect(() => dateRange('2026-03-31', '2026-03-01', true)).toThrow(
			"'from' date must be before 'to' date"
		);
		expect(() => dateRange('2025-01-01', '2026-03-01', true)).toThrow('limited to 366 days');
	});
});

describe('query parameters', () => {
	it('bounds integers', () => {
		const opts = { min: 1, max: 100, fallback: 100 };
		expect(intParam(null, 'limit', opts)).toBe(100);
		expect(intParam('5', 'limit', opts)).toBe(5);
		expect(() => intParam('101', 'limit', opts)).toThrow("'limit' must be between 1 and 100");
		expect(() => intParam('1.5', 'limit', opts)).toThrow('whole number');
	});
	it('reads booleans, UUIDs and instants strictly', () => {
		expect(boolParam('true', 'x')).toBe(true);
		expect(boolParam(null, 'x')).toBe(false);
		expect(() => boolParam('yes', 'x')).toThrow(ApiInputError);
		expect(uuidParam('2F3E0B6A-1C2D-4E5F-8A9B-0C1D2E3F4A5B', 'id')).toBe(
			'2f3e0b6a-1c2d-4e5f-8a9b-0c1d2e3f4a5b'
		);
		expect(() => uuidParam("1' OR 1=1", 'id')).toThrow(ApiInputError);
		expect(instantParam('2026-03-01T10:00:00Z', 'since')?.toISOString()).toBe(
			'2026-03-01T10:00:00.000Z'
		);
		expect(() => instantParam('yesterday', 'since')).toThrow(ApiInputError);
	});
});
