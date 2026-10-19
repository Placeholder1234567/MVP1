// A new version of the app is waiting (frontend-spec-2.md §8.5). The service
// worker never takes over on its own (no skipWaiting on install), so an open
// chart is never interrupted; the person chooses Refresh, and only when no
// form on screen has unsaved changes.

export const update = $state({ ready: false });

let registration: ServiceWorkerRegistration | undefined;
const CHECK_EVERY_MS = 60 * 60_000;

/** Starts watching for a waiting update; returns a stop function. */
export function watchForUpdate(): () => void {
	if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => {};
	let stopped = false;
	const waiting = (reg: ServiceWorkerRegistration) => {
		// The first install has no controller: nothing to update from.
		if (reg.waiting && navigator.serviceWorker.controller) update.ready = true;
	};
	void navigator.serviceWorker.getRegistration().then((reg) => {
		if (!reg || stopped) return;
		registration = reg;
		waiting(reg);
		reg.addEventListener('updatefound', () => {
			const next = reg.installing;
			next?.addEventListener('statechange', () => {
				if (next.state === 'installed') waiting(reg);
			});
		});
	});
	// A single-page app rarely does a full navigation, which is when the
	// browser checks for a new worker on its own.
	const timer = setInterval(() => {
		if (document.visibilityState === 'visible') void registration?.update().catch(() => {});
	}, CHECK_EVERY_MS);
	return () => {
		stopped = true;
		clearInterval(timer);
	};
}

/**
 * Whether a form on screen has unsaved changes. Forms already guard a reload
 * with a beforeunload handler that cancels the event, so ask them the same way.
 */
export function hasUnsavedWork(): boolean {
	const probe = new Event('beforeunload', { cancelable: true });
	window.dispatchEvent(probe);
	return probe.defaultPrevented;
}

/** Switches to the waiting version and reloads, or says why it can't yet. */
export function applyUpdate(): 'unsaved' | 'reloading' {
	if (hasUnsavedWork()) return 'unsaved';
	const next = registration?.waiting;
	if (!next) {
		location.reload();
		return 'reloading';
	}
	navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {
		once: true
	});
	next.postMessage({ type: 'skip-waiting' });
	return 'reloading';
}
