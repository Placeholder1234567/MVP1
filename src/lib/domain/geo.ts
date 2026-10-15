export interface LatLng {
	lat: number;
	lng: number;
}

export interface Geofenced {
	lat: number | null;
	lng: number | null;
	/** meters; homes default to 150 */
	radius?: number | null;
}

export const DEFAULT_RADIUS_M = 150;

/** Distance in meters between two points (haversine), unrounded. */
export function distanceMeters(a: LatLng, b: LatLng): number {
	const R = 6371000;
	const r = Math.PI / 180;
	const dLat = (b.lat - a.lat) * r;
	const dLng = (b.lng - a.lng) * r;
	const h =
		Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Same rule as the clock_records_verify trigger: verified when inside the
 * home's radius; unverified when either location is missing.
 */
export function checkGeofence(
	home: Geofenced,
	at: LatLng | null
): { verified: boolean; distance: number | null } {
	if (!at || home.lat == null || home.lng == null) return { verified: false, distance: null };
	const d = distanceMeters(at, { lat: home.lat, lng: home.lng });
	return { verified: d <= (home.radius ?? DEFAULT_RADIUS_M), distance: Math.round(d) };
}

/** Homes nearest first; homes without coordinates go last. */
export function rankHomes<T extends Geofenced>(homes: T[], at: LatLng | null) {
	return homes
		.map((home) => ({ home, ...checkGeofence(home, at) }))
		.sort((a, b) => {
			if (a.distance == null) return b.distance == null ? 0 : 1;
			if (b.distance == null) return -1;
			return a.distance - b.distance;
		})
		.map(({ home, verified, distance }) => ({ home, distance, inside: verified }));
}

export function formatDistance(m: number | null): string {
	if (m == null) return '';
	return m < 1000 ? `${m} m away` : `${(m / 1609.34).toFixed(1)} mi away`;
}
