// A new version of the app is waiting (frontend-spec-2.md §8.5). The service
// worker never takes over on its own (no skipWaiting on install), so an open
// chart is never interrupted; the person chooses Refresh, and only when no
// form has unsaved changes, in this tab or any other Guad tab: the new worker
// takes over every tab at once, and each one then reloads.

export const update = $state({ ready: false });

let registration: ServiceWorkerRegistration | undefined;
const CHECK_EVERY_MS = 60 * 60_000;
/** How long Refresh waits for other tabs to say whether they have unsaved work. */
const ASK_TABS_MS = 400;
const CHANNEL = 'guad-update';

/** Starts watching for a waiting update; returns a stop function. */
export function watchForUpdate(): () => void {
	if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => {};
	let stopped = false;
	// Other tabs ask before switching versions; answer for this one.
	const tabs = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);
	if (tabs)
		tabs.onmessage = (event) => {
			if (event.data?.type === 'unsaved?')
				tabs.postMessage({ type: 'unsaved', id: event.data.id, unsaved: hasUnsavedWork() });
		};
	// When the new version takes over (Refresh in any tab, after every tab
	// said it had nothing unsaved), this tab reloads onto it. The first
	// install also fires this, with no earlier version to leave; after it,
	// the tab has a version, so a later switch reloads too.
	let hadController = !!navigator.serviceWorker.controller;
	const switched = () => {
		if (hadController) location.reload();
		hadController = true;
	};
	navigator.serviceWorker.addEventListener('controllerchange', switched);
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
		tabs?.close();
		navigator.serviceWorker.removeEventListener('controllerchange', switched);
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

/** Whether any other open Guad tab has unsaved work (asked over a BroadcastChannel). */
export function otherTabsUnsaved(wait = ASK_TABS_MS): Promise<boolean> {
	if (typeof BroadcastChannel === 'undefined') return Promise.resolve(false);
	const ask = new BroadcastChannel(CHANNEL);
	const id = crypto.randomUUID();
	return new Promise((resolve) => {
		const done = (unsaved: boolean) => {
			clearTimeout(timer);
			ask.close();
			resolve(unsaved);
		};
		const timer = setTimeout(() => done(false), wait);
		ask.onmessage = (event) => {
			if (event.data?.type === 'unsaved' && event.data.id === id && event.data.unsaved) done(true);
		};
		ask.postMessage({ type: 'unsaved?', id });
	});
}

/** Switches to the waiting version (every tab then reloads), or says why it can't yet. */
export async function applyUpdate(): Promise<'unsaved' | 'unsaved-elsewhere' | 'reloading'> {
	if (hasUnsavedWork()) return 'unsaved';
	if (await otherTabsUnsaved()) return 'unsaved-elsewhere';
	const next = registration?.waiting;
	if (!next) {
		location.reload();
		return 'reloading';
	}
	next.postMessage({ type: 'skip-waiting' });
	return 'reloading';
}
