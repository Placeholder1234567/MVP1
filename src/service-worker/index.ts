import { self } from '$app/service-worker';
import { immutable } from '$app/manifest';
import { version } from '$app/env';
import workerAssets from 'virtual:guad-worker-assets';
import { pwaAssetPaths, pwaRequestKind } from '../lib/domain/pwa';

const CACHE = `guad-shell-${version}`;
const ASSETS = pwaAssetPaths([
	...immutable.map((asset) => '/' + asset.path.replace(/^\//, '')),
	...workerAssets
]);
let preparing: Promise<void> | undefined;
function prepareShell(): Promise<void> {
	return (preparing ??= (async () => {
		const cache = await caches.open(CACHE);
		// Never send a session cookie when fetching the public offline shell.
		await cache.addAll(
			ASSETS.map(
				(path) =>
					new Request(new URL(path, self.location.origin), {
						credentials: 'omit',
						cache: 'reload'
					})
			)
		);
	})().finally(() => {
		preparing = undefined;
	}));
}
self.addEventListener('install', (event) => {
	event.waitUntil(prepareShell());
});
self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const name of await caches.keys())
				if (name.startsWith('guad-shell-') && name !== CACHE) await caches.delete(name);
			await self.clients.claim();
		})()
	);
});
// No skipWaiting: an update must not interrupt an open chart or pending writes.
self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);
	const kind = pwaRequestKind(
		{
			method: event.request.method,
			origin: url.origin,
			path: url.pathname,
			search: url.search,
			mode: event.request.mode
		},
		self.location.origin,
		ASSETS
	);
	if (kind === 'network') return; // APIs, auth, external requests and data responses are never cached.
	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			if (kind === 'asset') {
				const saved = await cache.match(url.pathname);
				if (saved) return saved;
				// Logout purges code caches. Re-prepare fixed public files on the next online visit.
				try {
					await prepareShell();
				} catch {
					/* Offline: preserve existing encrypted records. */
				}
				return (await cache.match(url.pathname)) ?? fetch(event.request);
			}
			try {
				const response = await fetch(event.request);
				if (response.status < 500) return response;
			} catch {
				/* A navigation failure opens the public PIN gate, never cached private HTML. */
			}
			if (url.pathname !== '/offline')
				return Response.redirect(new URL('/offline', self.location.origin), 302);
			return (
				(await cache.match('/offline')) ??
				new Response('Connect to prepare this device for offline use.', {
					status: 503,
					headers: { 'content-type': 'text/plain' }
				})
			);
		})()
	);
});
