// The one PowerSync database for this tab (offline-sync.md §3). Encrypted at
// rest with the device key (SQLite3MultipleCiphers, ChaCha20). Opened only
// after the PIN unlocks the key, so the file is unreadable while locked.
import { PowerSyncDatabase, WASQLiteVFS } from '@powersync/web';
import { GuadConnector } from './connector.ts';
import { toHex } from './device-key.ts';
import { flushCareDrafts } from '#lib/app/care-drafts.ts';
import { DeviceSchema } from './app-schema.ts';

let db: PowerSyncDatabase | undefined;

export function currentDb(): PowerSyncDatabase | undefined {
	return db;
}

export async function openDb(
	key: Uint8Array,
	profileId?: string,
	options: { offline?: boolean } = {}
): Promise<PowerSyncDatabase> {
	if (db) return db;
	db = new PowerSyncDatabase({
		schema: DeviceSchema,
		database: {
			dbFilename: profileId ? `guad-${profileId}.db` : 'guad.db',
			// OPFS, not IndexedDB (constitution principle 2): the default VFS can be IndexedDB.
			vfs: WASQLiteVFS.OPFSCoopSyncVFS,
			encryptionKey: toHex(key),
			// One writer per OPFS file; only one tab syncs at a time.
			enableMultiTabs: false
		}
	});
	await db.init();
	if (!options.offline) await db.connect(new GuadConnector());
	return db;
}

/** Locking drops the database (and with it the key) from memory. */
export async function closeDb(): Promise<void> {
	await flushCareDrafts();
	await db?.close();
	db = undefined;
}
