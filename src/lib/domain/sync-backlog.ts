// Warnings for changes waiting on the device and for device storage
// (offline-sync.md §6 "Queue Size Monitoring" and §7 "Local Database Size
// Management"). A caregiver charting produces about 20-40 writes a shift, so
// 100+ waiting means the device has been offline for several shifts.

export interface DeviceWarning {
	level: 'warn' | 'bad';
	text: string;
}

export const BACKLOG_WARN = 101;
export const BACKLOG_CRITICAL = 500;

/** The banner for this many unsynced changes, or null below 101. */
export function backlogWarning(pending: number): DeviceWarning | null {
	if (pending >= BACKLOG_CRITICAL)
		return {
			level: 'bad',
			text: `Too many unsynced changes (${pending}). Please connect to Wi-Fi and keep the app open.`
		};
	if (pending >= BACKLOG_WARN)
		return { level: 'warn', text: `You have ${pending} unsynced changes. Connect to sync.` };
	return null;
}

const MB = 1024 * 1024;
/** Guad's local data normally stays around 50 MB (offline-sync.md §7). */
export const STORAGE_WARN_BYTES = 80 * MB;
/** Below this much free space for the site, writes may start failing. */
export const STORAGE_FREE_MIN_BYTES = 50 * MB;

/**
 * A warning when the browser's storage for Guad is large or nearly full
 * (navigator.storage.estimate()). Local data can't be trimmed by hand: the
 * sync windows do it, and anything removed locally would download again.
 */
export function storageWarning(usage?: number, quota?: number): DeviceWarning | null {
	if (usage == null) return null;
	if (quota != null && quota - usage < STORAGE_FREE_MIN_BYTES)
		return {
			level: 'bad',
			text: 'This device is almost out of storage for Guad. Free up space so new records can be saved.'
		};
	if (usage >= STORAGE_WARN_BYTES)
		return {
			level: 'warn',
			text: 'Guad is using a lot of storage on this device. Sync and keep the app open so older records can be cleared.'
		};
	return null;
}
