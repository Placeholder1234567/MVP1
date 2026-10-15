import type { StaffRole } from './notifications';

/** Only immutable application code and explicitly public PWA files may be cached. */
export const PUBLIC_PWA_FILES = [
	'/offline',
	'/_app/env.js', // SvelteKit's explicitly public configuration, required to boot offline.
	'/manifest.webmanifest',
	'/icons/guad-192.png',
	'/icons/guad-512.png'
];
export function pwaAssetPaths(build: string[]): string[] {
	return [
		...new Set([
			...build.filter(
				(p) =>
					p.startsWith('/_app/immutable/') &&
					!p.includes('..') &&
					!/[?#]/.test(p) &&
					!p.endsWith('.map')
			),
			...PUBLIC_PWA_FILES
		])
	];
}
export function pwaRequestKind(
	input: { method: string; origin: string; path: string; search: string; mode: string },
	origin: string,
	assets: readonly string[]
): 'asset' | 'navigation' | 'network' {
	if (
		input.method !== 'GET' ||
		input.origin !== origin ||
		input.search ||
		input.path.startsWith('/api/') ||
		input.path.startsWith('/auth/')
	)
		return 'network';
	if (input.mode === 'navigate') return 'navigation';
	return assets.includes(input.path) ? 'asset' : 'network';
}
export const OFFLINE_ACCESS_MS = 12 * 60 * 60 * 1000;
export function offlineAccessValid(verifiedAt: number | undefined, now = Date.now()): boolean {
	return (
		Number.isFinite(verifiedAt) &&
		verifiedAt! > 0 &&
		now >= verifiedAt! &&
		now - verifiedAt! < OFFLINE_ACCESS_MS
	);
}

interface OfflinePermissions {
	role: StaffRole;
	homeIds: string[];
	medCertified: boolean;
}
/** A stale snapshot may never grant more access than either verified or synced permissions. */
export function offlinePermissions(
	verified: OfflinePermissions,
	synced: OfflinePermissions
): OfflinePermissions {
	const rank = { caregiver: 0, supervisor: 1, admin: 2 };
	return {
		role: rank[verified.role] < rank[synced.role] ? verified.role : synced.role,
		homeIds: verified.homeIds.filter((id) => synced.homeIds.includes(id)),
		medCertified: verified.medCertified && synced.medCertified
	};
}
