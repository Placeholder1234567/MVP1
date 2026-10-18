// The one PowerSync database for this tab (offline-sync.md §3). Encrypted at
// rest with the device key (SQLite3MultipleCiphers, ChaCha20). Opened only
// after the PIN unlocks the key, so the file is unreadable while locked.
import { PowerSyncDatabase, WASQLiteVFS } from '@powersync/web';
import { GuadConnector } from './connector.ts';
import { toHex } from './device-key.ts';
import { flushCareDrafts } from '#lib/app/care-drafts.ts';
import { DeviceSchema } from './app-schema.ts';

let db: PowerSyncDatabase | undefined;
/** The file the open (or opening) database belongs to. */
let dbFile: string | undefined;
/** Ends this tab's hold on the database lock (see holdLock). */
let release: (() => void) | undefined;
/** Bumped by closeDb, so an open still waiting for the lock knows to stop. */
let generation = 0;
/** Cancels a wait for the lock (sign-out, lock, leaving the page). */
let waiting: AbortController | undefined;

/**
 * Only one tab can open the OPFS file (offline-sync.md test 10). A Web Lock
 * named after the file is held while it is open. A second tab sees the lock is
 * taken, calls onWait so it can say so, and opens once the first tab locks or
 * closes, instead of hanging on the file. The wait can be cancelled.
 */
async function holdLock(name: string, signal: AbortSignal, onWait?: () => void): Promise<void> {
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
	await new Promise<void>((resolve, reject) => {
		navigator.locks
			.request(name, { signal }, () => {
				resolve();
				return hold();
			})
			.catch(reject);
	});
}

export function currentDb(): PowerSyncDatabase | undefined {
	return db;
}

/** An open in progress; a second call for the same file joins it (Web Locks are not re-entrant). */
let opening: Promise<PowerSyncDatabase> | undefined;

const fileFor = (profileId?: string) => (profileId ? `guad-${profileId}.db` : 'guad.db');

export async function openDb(
	key: Uint8Array,
	profileId?: string,
	options: { offline?: boolean; onWait?: () => void } = {}
): Promise<PowerSyncDatabase> {
	const file = fileFor(profileId);
	// Never hand one person's database to another: anything open or opening
	// for a different file is closed first.
	if ((db || opening) && dbFile !== file) await closeDb();
	if (db) return db;
	if (!opening) {
		const attempt: Promise<PowerSyncDatabase> = open(key, file, options).finally(() => {
			if (opening === attempt) opening = undefined;
		});
		opening = attempt;
	}
	return opening;
}

async function open(
	key: Uint8Array,
	dbFilename: string,
	options: { offline?: boolean; onWait?: () => void }
): Promise<PowerSyncDatabase> {
	const mine = ++generation;
	dbFile = dbFilename;
	const controller = new AbortController();
	waiting = controller;
	try {
		await holdLock(`guad-db:${dbFilename}`, controller.signal, options.onWait);
	} finally {
		if (waiting === controller) waiting = undefined;
	}
	// Closed (signed out, locked, page left) while waiting: give the lock back.
	if (mine !== generation) {
		release?.();
		release = undefined;
		throw new DOMException('The database was closed while waiting', 'AbortError');
	}
	const instance = new PowerSyncDatabase({
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
	db = instance;
	try {
		await instance.init();
		if (!options.offline) await instance.connect(new GuadConnector());
		if (mine !== generation)
			throw new DOMException('The database was closed while opening', 'AbortError');
	} catch (e) {
		await instance.close().catch(() => {});
		// Only undo what is still this attempt's; closeDb may already have.
		if (mine === generation) {
			db = undefined;
			dbFile = undefined;
			release?.();
			release = undefined;
		}
		throw e;
	}
	return instance;
}

/** Locking drops the database (and with it the key) from memory. */
export async function closeDb(): Promise<void> {
	// A pending open stops waiting for the lock and won't open afterwards.
	generation++;
	waiting?.abort();
	waiting = undefined;
	opening = undefined;
	// The session reference is already disposed when privacy locking starts.
	if (db) await flushCareDrafts(db);
	await db?.close();
	db = undefined;
	dbFile = undefined;
	release?.();
	release = undefined;
}
