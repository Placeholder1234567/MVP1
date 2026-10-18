// Catches the browser's install offer (beforeinstallprompt) as soon as the app
// loads, so the Today banner (InstallPrompt.svelte) can show it later; the
// event fires once per page load. Imported by the (app) layout for that reason.
import { updateInstallState } from './install-state';

interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const install = $state({
	offer: null as BeforeInstallPromptEvent | null,
	/** A prompt was closed this session (frontend-spec-2.md §8.4: once per session). */
	closed: false
});

let visit: ReturnType<typeof updateInstallState> | undefined;
/** Counts this app load once, however many times Today is opened. */
export function countVisit() {
	return (visit ??= updateInstallState((s) => ({ visits: s.visits + 1 })));
}

if (typeof window !== 'undefined') {
	addEventListener('beforeinstallprompt', (event) => {
		// Keep Chrome's own mini-infobar away; the Today banner offers it instead.
		event.preventDefault();
		install.offer = event as BeforeInstallPromptEvent;
	});
	addEventListener('appinstalled', () => {
		install.offer = null;
		void updateInstallState(() => ({ installed: true }));
	});
}
