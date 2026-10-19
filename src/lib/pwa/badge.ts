// The unread count on the installed app's icon (notifications.md "Badge
// Management"). A number only, never what the alerts say. Browsers without
// the Badging API (iOS before 16.4, Firefox) just show the in-app count.

type Badging = { setAppBadge?(n?: number): Promise<void>; clearAppBadge?(): Promise<void> };

/** Shows `count` on the app icon, or clears it at zero. Never throws. */
export async function showBadge(count: number, nav: Badging = globalThis.navigator ?? {}) {
	try {
		if (count > 0) await nav.setAppBadge?.(count);
		else await nav.clearAppBadge?.();
	} catch {
		// Not installed, or the browser refused: the in-app count still shows.
	}
}
