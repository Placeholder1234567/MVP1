import type { StaffRole } from './notifications';

/** Only immutable application code and explicitly public PWA files may be cached. */
export const PUBLIC_PWA_FILES = [
	'/offline',
	'/_app/env.js', // SvelteKit's explicitly public configuration, required to boot offline.
	'/manifest.webmanifest',
	'/icons/guad-192.png',
	'/icons/guad-512.png'
];
/**
 * The database runs in a worker that loads its own SQLite build from
 * /_app/immutable/workers/assets/. The copies the bundler also emits under
 * /_app/immutable/assets/ are never requested, so they aren't pre-downloaded
 * (about 7 MB per device on every install and update).
 */
const unusedWasm = (p: string) => p.startsWith('/_app/immutable/assets/') && p.endsWith('.wasm');

export function pwaAssetPaths(build: string[]): string[] {
	return [
		...new Set([
			...build.filter(
				(p) =>
					p.startsWith('/_app/immutable/') &&
					!p.includes('..') &&
					!/[?#]/.test(p) &&
					!p.endsWith('.map') &&
					!unusedWasm(p)
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

/** Install prompts (frontend-spec-2.md §8.4), counted per device. */
export interface InstallState {
	/** App loads on this device. */
	visits: number;
	/** Times the install banner was closed without installing. */
	dismissals: number;
	installed: boolean;
	/** "Got it" on the iOS instructions. */
	iosDone: boolean;
	/** The welcome shown on first launch of the installed app. */
	welcomed: boolean;
}
export const NEW_INSTALL_STATE: InstallState = {
	visits: 0,
	dismissals: 0,
	installed: false,
	iosDone: false,
	welcomed: false
};
export function parseInstallState(value: unknown): InstallState {
	const v = (typeof value === 'object' && value) || {};
	const count = (n: unknown) =>
		typeof n === 'number' && Number.isInteger(n) && n >= 0 ? Math.min(n, 1000) : 0;
	const flag = (b: unknown) => b === true;
	const r = v as Record<string, unknown>;
	return {
		visits: count(r.visits),
		dismissals: count(r.dismissals),
		installed: flag(r.installed),
		iosDone: flag(r.iosDone),
		welcomed: flag(r.welcomed)
	};
}
export type InstallPromptKind = 'banner' | 'ios-sheet' | 'welcome' | null;
export function installPrompt(
	state: InstallState,
	env: {
		/** Running as the installed app (display-mode: standalone). */
		standalone: boolean;
		/** The browser offered beforeinstallprompt. */
		canPrompt: boolean;
		/** Touch-first device; the banner is for phones and tablets. */
		mobile: boolean;
		/** Safari on iPhone or iPad, which has no install prompt API. */
		iosSafari: boolean;
		/** A prompt was already closed this session. */
		closedThisSession: boolean;
	}
): InstallPromptKind {
	if (env.standalone) return state.welcomed ? null : 'welcome';
	if (state.installed || env.closedThisSession) return null;
	// Not on the first visit: let people use the app before asking.
	if (env.canPrompt && env.mobile && state.visits >= 2 && state.dismissals < 3) return 'banner';
	if (env.iosSafari && state.visits >= 3 && !state.iosDone) return 'ios-sheet';
	return null;
}
/** iPhone/iPad Safari, including iPadOS reporting as a Mac. Other iOS browsers can't add to the home screen the same way. */
export function isIosSafari(userAgent: string, maxTouchPoints: number): boolean {
	const ios =
		/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
	return ios && /Safari\//.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent);
}
