// Changes the server refused (offline-sync.md §6 "Permanently Failed
// Writes"): the person can try one again or let it go. Trying again writes
// the same change to the local database, so it queues and uploads like any
// other edit, through the same server rules.

export interface FailedWrite {
	id: string;
	record_id: string;
	table_name: string;
	op: string;
	message: string;
	data: string | null;
	failed_at: string;
}

/** What kind of record a failed change was, in words a caregiver knows. */
const LABELS: Record<string, string> = {
	notes: 'Shift note',
	note_goals: 'Goal score',
	mar_records: 'Medication record',
	controlled_counts: 'Count book entry',
	health_entries: 'Health entry',
	incidents: 'Incident report',
	attendance: 'Attendance',
	clock_records: 'Clock punch',
	messages: 'Board message',
	message_reads: 'Message read',
	coverage_requests: 'Coverage request',
	user_settings: 'Setting',
	notification_preferences: 'Alert setting',
	notifications: 'Alert'
};

export const failedLabel = (table: string) => LABELS[table] ?? 'Change';

export type Statement = { sql: string; params: unknown[] };

/**
 * The local write that queues this change again, or null when it can't be
 * retried. `columns` lists a synced table's columns (null for anything else),
 * so table and column names from the stored change never reach SQL unchecked.
 * `exists` says whether the row is on the device now: a refused new record
 * disappears once the device catches up with the server, and only then can
 * it be added again.
 */
export function retryStatement(
	write: Pick<FailedWrite, 'table_name' | 'op' | 'record_id' | 'data'>,
	columns: (table: string) => readonly string[] | null,
	exists: boolean
): Statement | { wait: true } | null {
	const known = columns(write.table_name);
	if (!known) return null;
	const table = `"${write.table_name}"`;
	if (write.op === 'DELETE') {
		return exists ? { sql: `DELETE FROM ${table} WHERE id = ?`, params: [write.record_id] } : null;
	}
	let data: Record<string, unknown>;
	try {
		data = JSON.parse(write.data ?? '{}') ?? {};
	} catch {
		return null;
	}
	const entries = Object.entries(data).filter(([k]) => known.includes(k));
	if (!entries.length) return null;
	const value = (v: unknown) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
	if (write.op === 'PUT') {
		if (exists) return { wait: true };
		const cols = ['id', ...entries.map(([k]) => k)];
		return {
			sql: `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
			params: [write.record_id, ...entries.map(([, v]) => value(v))]
		};
	}
	if (write.op === 'PATCH') {
		if (!exists) return null;
		return {
			sql: `UPDATE ${table} SET ${entries.map(([k]) => `"${k}" = ?`).join(', ')} WHERE id = ?`,
			params: [...entries.map(([, v]) => value(v)), write.record_id]
		};
	}
	return null;
}
