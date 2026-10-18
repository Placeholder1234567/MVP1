// The device's full schema: the synced tables (generated in schema.ts) plus
// local-only tables that never leave the device.
import { column, Schema, Table } from '@powersync/web';
import { syncedTables } from './schema.ts';

/**
 * Changes the server refused (offline-sync.md §6 "Permanently Failed Writes").
 * Kept so the user can see what wasn't saved. `message` comes from the server
 * and contains no PHI; the change itself stays in the encrypted database.
 */
const failed_writes = new Table(
	{
		record_id: column.text,
		table_name: column.text,
		op: column.text,
		code: column.text,
		message: column.text,
		data: column.text,
		failed_at: column.text
	},
	{ localOnly: true }
);

/** Messages to show once, e.g. a dose also recorded by someone else. */
const sync_notices = new Table(
	{
		record_id: column.text,
		table_name: column.text,
		code: column.text,
		message: column.text,
		created_at: column.text,
		seen: column.integer
	},
	{ localOnly: true }
);

// The last server-verified workspace identity, kept inside the encrypted database.
const offline_sessions = new Table({ user_json: column.text }, { localOnly: true });
// Unsigned form recovery only. localOnly excludes these rows from the CRUD upload queue.
const care_drafts = new Table(
	{
		profile_id: column.text,
		client_id: column.text,
		section: column.text,
		data: column.text,
		updated_at: column.text
	},
	{ localOnly: true }
);
export const DeviceSchema = new Schema({
	...syncedTables,
	failed_writes,
	sync_notices,
	offline_sessions,
	care_drafts
});
