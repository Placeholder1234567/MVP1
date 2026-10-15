import { describe, expect, it } from 'vitest';
import { checkGeofence, distanceMeters, formatDistance, rankHomes } from '../../../src/lib/domain';

const oak = { id: 'oak', lat: 40.0, lng: -75.0, radius: 150 };
const maple = { id: 'maple', lat: 40.01, lng: -75.0, radius: null };
const unknown = { id: 'x', lat: null, lng: null };

describe('geofence', () => {
	it('measures distance like the MVP and the clock_records_verify trigger', () => {
		// 0.01 degrees of latitude is about 1,112 m
		expect(Math.round(distanceMeters({ lat: 40, lng: -75 }, { lat: 40.01, lng: -75 }))).toBe(1112);
	});

	it('verifies inside the radius and not outside it', () => {
		expect(checkGeofence(oak, { lat: 40.0005, lng: -75 })).toEqual({
			verified: true,
			distance: 56
		});
		expect(checkGeofence(oak, { lat: 40.002, lng: -75 }).verified).toBe(false);
	});

	it('uses 150 m when a home has no radius, and is unverified without a location', () => {
		expect(checkGeofence(maple, { lat: 40.011, lng: -75 }).verified).toBe(true);
		expect(checkGeofence(oak, null)).toEqual({ verified: false, distance: null });
		expect(checkGeofence(unknown, { lat: 40, lng: -75 })).toEqual({
			verified: false,
			distance: null
		});
	});

	it('ranks homes nearest first with unknown locations last', () => {
		const ranked = rankHomes([unknown, maple, oak], { lat: 40.0001, lng: -75 });
		expect(ranked.map((r) => r.home.id)).toEqual(['oak', 'maple', 'x']);
		expect(ranked[0].inside).toBe(true);
	});

	it('formats distances', () => {
		expect(formatDistance(56)).toBe('56 m away');
		expect(formatDistance(1609)).toBe('1.0 mi away');
		expect(formatDistance(null)).toBe('');
	});
});
