import { expect, it } from 'vitest';
import {
	offlineAccessValid,
	OFFLINE_ACCESS_MS,
	pwaAssetPaths,
	pwaRequestKind
} from '../../../src/lib/domain/pwa';
import { offlinePermissions } from '../../../src/lib/domain/pwa';

it('only caches immutable build assets and the explicitly public offline shell', () => {
	const paths = pwaAssetPaths([
		'/_app/immutable/app.js',
		'/_app/immutable/app.js',
		'/dashboard',
		'/api/trpc',
		'/_app/immutable/code.js.map',
		'/_app/immutable/app.js?secret=1',
		'/_app/immutable/../private'
	]);
	expect(paths).toEqual([
		'/_app/immutable/app.js',
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
