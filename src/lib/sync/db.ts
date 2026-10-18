// The one PowerSync database for this tab (offline-sync.md §3). Encrypted at
// rest with the device key (SQLite3MultipleCiphers, ChaCha20). Opened only
// after the PIN unlocks the key, so the file is unreadable while locked.
import { PowerSyncDatabase, WASQLiteVFS } from '@powersync/web';
import { GuadConnector } from './connector.ts';
import { toHex } from './device-key.ts';
import { flushCareDrafts } from '#lib/app/care-drafts.ts';
import { DeviceSchema } from './app-schema.ts';

let db: PowerSyncDatabase | undefined;
/** Ends this tab's hold on the database lock (see holdLock). */
let release: (() => void) | undefined;

/**
 * Only one tab can open the OPFS file (offline-sync.md test 10). A Web Lock
 * named after the file is held while it is open. A second tab sees the lock is
 * taken, calls onWait so it can say so, and opens once the first tab locks or
 * closes, instead of hanging on the file.
 */
async function holdLock(name: string, onWait?: () => void): Promise<void> {
	if (typeof navigator === 'undefined' || !navigator.locks) return;
	const hold = () => new Promise<void>((done) => (release = done));
	const got = await new Promise<boolean>((resolve) => {
		void navigator.locks.request(name, { ifAvailable: true }, (lock) => {
			resolve(!!lock);
			return lock ? hold() : undefined;
		});
	});
	if (got) return;
	onWait?.();
	await new Promise<void>((resolve) => {
		void navigator.locks.request(name, () => {
			resolve();
			return hold();
		});
	});
}

export function currentDb(): PowerSyncDatabase | undefined {
	return db;
}

/** An open in progress; a second call joins it (Web Locks are not re-entrant). */
let opening: Promise<PowerSyncDatabase> | undefined;

export function openDb(
	key: Uint8Array,
	profileId?: string,
	options: { offline?: boolean; onWait?: () => void } = {}
): Promise<PowerSyncDatabase> {
	if (db) return Promise.resolve(db);
	opening ??= open(key, profileId, options).finally(() => (opening = undefined));
	return opening;
}

async function open(
	key: Uint8Array,
	profileId: string | undefined,
	options: { offline?: boolean; onWait?: () => void }
): Promise<PowerSyncDatabase> {
	const dbFilename = profileId ? `guad-${profileId}.db` : 'guad.db';
	await holdLock(`guad-db:${dbFilename}`, options.onWait);
	db = new PowerSyncDatabase({
		schema: DeviceSchema,
		database: {
			dbFilename,
			// OPFS, not IndexedDB (constitution principle 2): the default VFS can be IndexedDB.
			vfs: WASQLiteVFS.OPFSCoopSyncVFS,
			encryptionKey: toHex(key),
			// One writer per OPFS file; only one tab syncs at a time.
			enableMultiTabs: false
		}
	});
	try {
		await db.init();
		if (!options.offline) await db.connect(new GuadConnector());
	} catch (e) {
		await db.close().catch(() => {});
		db = undefined;
		release?.();
		release = undefined;
		throw e;
	}
	return db;
}

/** Locking drops the database (and with it the key) from memory. */
export async function closeDb(): Promise<void> {
	// The session reference is already disposed when privacy locking starts.
	if (db) await flushCareDrafts(db);
	await db?.close();
	db = undefined;
	release?.();
	release = undefined;
}
