// Sync Service (services.md): device sync windows.
import { withService } from '../../db';
import { expireDeviceRows } from './sync.queries';

/**
 * SyncWindowJob (offline-sync.md §7): sets device_sync = false on rows older
 * than their table's window, so PowerSync removes them from devices. Rows are
 * never deleted on the server. Idempotent.
 */
export function applySyncWindows(now: Date = new Date()): Promise<Record<string, number>> {
	return withService((tx) => expireDeviceRows(tx, now));
}
