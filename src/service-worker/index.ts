import { self } from '$app/service-worker';
import { immutable } from '$app/manifest';
import { version } from '$app/env';
import workerAssets from 'virtual:guad-worker-assets';
import { pwaAssetPaths, pwaRequestKind } from '../lib/domain/pwa';
import { pushNotice, pushNotificationId, pushPath } from '../lib/domain/push';
import { pushEnabled } from '../lib/pwa/push-storage';

// Raw Push API handling intentionally avoids Firebase's automatic display of payload text.
// Only the canonical notification UUID survives; messages and links are ignored.
self.addEventListener('message', (event) => {
	if (event.data?.type === 'guad-push-version') event.ports[0]?.postMessage({ guadPushVersion: 1 });
});
self.addEventListener('push', (event) => {
	event.waitUntil(
		(async () => {
			if (!(await pushEnabled())) return;
			let payload: unknown;
			try {
				payload = event.data?.json();
			} catch {
				return;
			}
			const notice = pushNotice(payload);
			if (!notice) return;
			const notificationId = notice.id;
			const clients = await self.clients.matchAll({ type: 'window' });
			const visible = clients.filter((client) => client.visibilityState === 'visible');
			if (visible.length) {
				for (const client of visible) client.postMessage({ type: 'guad-push', notificationId });
				return;
			}
			await self.registration.showNotification(notice.title, notice.options);
		})()
	);
});
self.addEventListener('notificationclick', (event) => {
	const notificationId = pushNotificationId({ data: event.notification.data });
	if (!notificationId) return;
	event.notification.close();
	event.waitUntil(
		(async () => {
			if (!(await pushEnabled())) return;
			const clients = await self.clients.matchAll({ type: 'window' });
			const existing = clients.find(
				(client) => new URL(client.url).origin === self.location.origin
			);
			if (existing) {
				// Preserve open charts and unsaved text; the user follows an in-app link after focus.
				await existing.focus();
				existing.postMessage({ type: 'guad-push', notificationId });
			} else
				await self.clients.openWindow(new URL(pushPath(notificationId), self.location.origin).href);
		})()
	);
});

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
// No skipWaiting on install: an update must not interrupt an open chart or
// pending writes. The app asks for it once the person taps Refresh and no
// form has unsaved changes (frontend-spec-2.md §8.5, pwa/update.svelte.ts).
self.addEventListener('message', (event) => {
	if (event.data?.type === 'skip-waiting') void self.skipWaiting();
});
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
