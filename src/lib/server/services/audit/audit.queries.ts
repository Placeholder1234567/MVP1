import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { RequestInfo, Tx } from '../../db';
import { auditLog, profiles } from '../../db/schema';

export interface AuditFilter {
	from?: Date;
	to?: Date;
	tableName?: string;
	recordId?: string;
	performedBy?: string;
	action?: 'INSERT' | 'UPDATE' | 'DELETE';
	limit: number;
	offset: number;
}

// Runs as app_user: audit_log_select limits rows to the caller's agency.
export function selectAuditEntries(tx: Tx, agencyId: string, f: AuditFilter) {
	const where = [eq(auditLog.agency_id, agencyId)];
	if (f.from) where.push(gte(auditLog.created_at, f.from));
	if (f.to) where.push(lte(auditLog.created_at, f.to));
	if (f.tableName) where.push(eq(auditLog.table_name, f.tableName));
	if (f.recordId) where.push(eq(auditLog.record_id, f.recordId));
	if (f.performedBy) where.push(eq(auditLog.performed_by, f.performedBy));
	if (f.action) where.push(eq(auditLog.action, f.action));
	// Metadata only: the old and new values (which can hold client data) are
	// shown one entry at a time, and each view is itself recorded.
	return tx
		.select({
			id: auditLog.id,
			tableName: auditLog.table_name,
			recordId: auditLog.record_id,
			action: auditLog.action,
			performedBy: auditLog.performed_by,
			performedByName: profiles.name,
			createdAt: auditLog.created_at
		})
		.from(auditLog)
		.leftJoin(profiles, eq(profiles.id, auditLog.performed_by))
		.where(and(...where))
		.orderBy(desc(auditLog.created_at))
		.limit(f.limit)
		.offset(f.offset);
}

export async function selectAuditEntry(tx: Tx, agencyId: string, id: string) {
	const [row] = await tx
		.select({
			id: auditLog.id,
			tableName: auditLog.table_name,
			recordId: auditLog.record_id,
			action: auditLog.action,
			oldValues: auditLog.old_values,
			newValues: auditLog.new_values,
			performedBy: auditLog.performed_by,
			performedByName: profiles.name,
			ipAddress: auditLog.ip_address,
			userAgent: auditLog.user_agent,
			createdAt: auditLog.created_at
		})
		.from(auditLog)
		.leftJoin(profiles, eq(profiles.id, auditLog.performed_by))
		.where(and(eq(auditLog.agency_id, agencyId), eq(auditLog.id, id)))
		.limit(1);
	return row ?? null;
}

/** Viewing an entry's values is a PHI read (security.md "Audit Trail > Access"). */
export async function recordAuditView(
	tx: Tx,
	agencyId: string,
	viewerId: string,
	entryId: string,
	request: RequestInfo
) {
	await tx.insert(auditLog).values({
		agency_id: agencyId,
		table_name: 'audit_views',
		record_id: entryId,
		action: 'INSERT',
		performed_by: viewerId,
		ip_address: request.ip,
		user_agent: request.user_agent,
		new_values: { viewed: entryId }
	});
}

/** Each saved state of one note, oldest first (the audit trigger's new_values). */
export function selectNoteStates(tx: Tx, agencyId: string, noteId: string) {
	return tx
		.select({
			at: auditLog.created_at,
			by: profiles.name,
			values: auditLog.new_values
		})
		.from(auditLog)
		.leftJoin(profiles, eq(profiles.id, auditLog.performed_by))
		.where(
			and(
				eq(auditLog.agency_id, agencyId),
				eq(auditLog.table_name, 'notes'),
				eq(auditLog.record_id, noteId),
				inArray(auditLog.action, ['INSERT', 'UPDATE'])
			)
		)
		.orderBy(asc(auditLog.created_at), asc(auditLog.id))
		.limit(500);
}

/** Reading a note's earlier versions is a PHI read of the audit trail. */
export async function recordNoteVersionsView(
	tx: Tx,
	agencyId: string,
	viewerId: string,
	noteId: string,
	request: RequestInfo
) {
	await tx.insert(auditLog).values({
		agency_id: agencyId,
		table_name: 'audit_views',
		record_id: noteId,
		action: 'INSERT',
		performed_by: viewerId,
		ip_address: request.ip,
		user_agent: request.user_agent,
		new_values: { viewed: 'note_versions', note: noteId }
	});
}

/** Downloading the audit log is recorded like any other export. */
export async function recordAuditExport(
	tx: Tx,
	agencyId: string,
	viewerId: string,
	rows: number,
	request: RequestInfo
) {
	await tx.insert(auditLog).values({
		agency_id: agencyId,
		table_name: 'report_exports',
		record_id: crypto.randomUUID(),
		action: 'INSERT',
		performed_by: viewerId,
		ip_address: request.ip,
		user_agent: request.user_agent,
		new_values: { type: 'audit_log', format: 'csv', rows }
	});
}
