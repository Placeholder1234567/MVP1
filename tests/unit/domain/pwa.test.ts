import { describe, expect, it } from 'vitest';
import {
	offlineAccessValid,
	OFFLINE_ACCESS_MS,
	pwaAssetPaths,
	pwaRequestKind
} from '../../../src/lib/domain/pwa';
import {
	installPrompt,
	isIosSafari,
	NEW_INSTALL_STATE,
	offlinePermissions,
	parseInstallState,
	type InstallState
} from '../../../src/lib/domain/pwa';

it('only caches immutable build assets and the explicitly public offline shell', () => {
	const paths = pwaAssetPaths([
		'/_app/immutable/app.js',
		'/_app/immutable/app.js',
		'/dashboard',
		'/api/trpc',
		'/_app/immutable/code.js.map',
		'/_app/immutable/app.js?secret=1',
		'/_app/immutable/../private',
		// The worker's SQLite build is kept; the unused bundle copies are not.
		'/_app/immutable/workers/assets/mc-wa-sqlite-B1.wasm',
		'/_app/immutable/assets/mc-wa-sqlite.B1.wasm',
		'/_app/immutable/assets/wa-sqlite-async.C2.wasm'
	]);
	expect(paths).toEqual([
		'/_app/immutable/app.js',
		'/_app/immutable/workers/assets/mc-wa-sqlite-B1.wasm',
		'/offline',
		'/_app/env.js',
		'/manifest.webmanifest',
		'/icons/guad-192.png',
		'/icons/guad-512.png'
	]);
	const base = {
		method: 'GET',
		origin: 'https://example.test',
		path: '/_app/immutable/app.js',
		search: '',
		mode: 'cors'
	};
	expect(pwaRequestKind(base, base.origin, paths)).toBe('asset');
	for (const change of [
		{ method: 'POST' },
		{ search: '?input=private' },
		{ origin: 'https://other.test' },
		{ path: '/api/trpc' },
		{ path: '/auth/sync-token' },
		{ path: '/people/123/__data.json' },
		{ path: '/notes/123' }
	])
		expect(pwaRequestKind({ ...base, ...change }, base.origin, paths)).toBe('network');
	expect(pwaRequestKind({ ...base, path: '/today', mode: 'navigate' }, base.origin, paths)).toBe(
		'navigation'
	);
	expect(
		pwaRequestKind({ ...base, path: '/api/export', mode: 'navigate' }, base.origin, paths)
	).toBe('network');
});
it('requires recent verified access and rejects expired, absent and future markers', () => {
	const now = 200000000;
	expect(offlineAccessValid(now, now)).toBe(true);
	expect(offlineAccessValid(now - OFFLINE_ACCESS_MS + 1, now)).toBe(true);
	for (const time of [undefined, 0, NaN, Infinity, now + 1, now - OFFLINE_ACCESS_MS])
		expect(offlineAccessValid(time, now)).toBe(false);
});

it('does not widen a stale offline role, home scope or medication certification', () => {
	const limited = { role: 'caregiver' as const, homeIds: ['one'], medCertified: false };
	const wide = { role: 'admin' as const, homeIds: ['one', 'two'], medCertified: true };
	expect(offlinePermissions(limited, wide)).toEqual(limited);
	expect(offlinePermissions(wide, limited)).toEqual(limited);
	expect(offlinePermissions(limited, { ...limited, homeIds: ['two'] }).homeIds).toEqual([]);
});

describe('install prompts (frontend-spec-2.md §8.4)', () => {
	const env = {
		standalone: false,
		canPrompt: true,
		mobile: true,
		iosSafari: false,
		closedThisSession: false
	};
	const at = (s: Partial<InstallState>) => ({ ...NEW_INSTALL_STATE, ...s });

	it('offers the banner from the second visit on phones that can install', () => {
		expect(installPrompt(at({ visits: 1 }), env)).toBeNull();
		expect(installPrompt(at({ visits: 2 }), env)).toBe('banner');
		expect(installPrompt(at({ visits: 2 }), { ...env, mobile: false })).toBeNull();
		expect(installPrompt(at({ visits: 2 }), { ...env, canPrompt: false })).toBeNull();
	});

	it('stops after three dismissals, after install, and once closed this session', () => {
		expect(installPrompt(at({ visits: 9, dismissals: 2 }), env)).toBe('banner');
		expect(installPrompt(at({ visits: 9, dismissals: 3 }), env)).toBeNull();
		expect(installPrompt(at({ visits: 9, installed: true }), env)).toBeNull();
		expect(installPrompt(at({ visits: 9 }), { ...env, closedThisSession: true })).toBeNull();
	});

	it('shows iOS Safari instructions from the third visit until "Got it"', () => {
		const ios = { ...env, canPrompt: false, iosSafari: true };
		expect(installPrompt(at({ visits: 2 }), ios)).toBeNull();
		expect(installPrompt(at({ visits: 3 }), ios)).toBe('ios-sheet');
		expect(installPrompt(at({ visits: 3, iosDone: true }), ios)).toBeNull();
	});

	it('welcomes once in the installed app and never offers install there', () => {
		const app = { ...env, standalone: true };
		expect(installPrompt(at({ visits: 5 }), app)).toBe('welcome');
		expect(installPrompt(at({ visits: 5, welcomed: true }), app)).toBeNull();
	});

	it('reads stored counts defensively', () => {
		expect(parseInstallState(null)).toEqual(NEW_INSTALL_STATE);
		expect(parseInstallState({ visits: -1, dismissals: 2.5, installed: 'yes' })).toEqual(
			NEW_INSTALL_STATE
		);
		expect(parseInstallState({ visits: 4, iosDone: true })).toMatchObject({
			visits: 4,
			iosDone: true
		});
	});

	it('recognises iPhone and iPad Safari only', () => {
		const iphone =
			'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
		const ipad =
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
		expect(isIosSafari(iphone, 5)).toBe(true);
		expect(isIosSafari(ipad, 5)).toBe(true);
		expect(isIosSafari(ipad, 0)).toBe(false);
		expect(isIosSafari(iphone.replace('Version/18.0', 'CriOS/130.0'), 5)).toBe(false);
		expect(
			isIosSafari(
				'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36',
				5
			)
		).toBe(false);
	});
});
