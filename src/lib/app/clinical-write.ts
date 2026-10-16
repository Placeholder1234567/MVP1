import type { CareSession } from './session.svelte';

type ClinicalTable = 'health_entries' | 'incidents' | 'mar_records' | 'attendance';

/**
 * Writes a new care record to the encrypted on-device database. PowerSync
 * queues it and uploads it through sync.upload, which runs the same service
 * as the online procedure: identity columns (author, agency, home) are set
 * again on the server from the session, and every field is revalidated.
 * Returns the new record's ID.
 */
export async function insertClinical(
	app: CareSession,
	table: ClinicalTable,
	clientId: string,
	fields: Record<string, string | number | null>
): Promise<string> {
	const person = app.people.find((p) => p.id === clientId && p.active);
	if (!app.db || app.privacyLocked || !person || !app.homes.some((h) => h.id === person.home_id))
		throw new Error('Record unavailable');
	const now = new Date().toISOString();
	const row = {
		...fields,
		id: crypto.randomUUID(),
		agency_id: app.user.agencyId,
		client_id: clientId,
		home_id: person.home_id,
		created_by: app.user.profileId,
		created_at: now,
		updated_at: now
	};
	const columns = Object.keys(row);
	// Local SQLite (PowerSync), not the server database. Table and column names
	// come from this module and its callers, never from user input.
	await app.db.execute(
		`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
		Object.values(row)
	);
	return row.id;
}

/** True when an online-only action (supervisor review, PRN effect) can run now. */
export function canReachServer(app: CareSession): boolean {
	return !!app.db?.currentStatus.connected && !app.pending;
}

/** "8:12am" in the agency's time zone. */
export function timeOf(iso: string | null | undefined, timeZone: string): string {
	if (!iso) return '';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	return d
		.toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })
		.replace(/\s/g, '')
		.toLowerCase();
}

/** "Oct 10 2:30pm" in the agency's time zone. */
export function dayTimeOf(iso: string | null | undefined, timeZone: string): string {
	if (!iso) return '';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	return `${d.toLocaleDateString('en-US', { timeZone, month: 'short', day: 'numeric' })} ${timeOf(iso, timeZone)}`;
}
