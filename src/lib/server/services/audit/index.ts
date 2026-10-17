// Audit Service (services.md §19; trpc-router.md `audit.*`): read-only access
// to the agency's audit trail for admins on the Complete plan. Rows are
// written only by the audit_row_change trigger and trusted-server events;
// nothing here changes them.
import { z } from 'zod';
import { asService, type RequestInfo, type Tx } from '../../db';
import { ServiceError } from '../../errors';
import { recordAuditView, selectAuditEntries, selectAuditEntry } from './audit.queries';

export const AuditFilterInput = z.object({
	dateRange: z.object({ from: z.iso.datetime(), to: z.iso.datetime() }).optional(),
	tableName: z.string().trim().max(64).optional(),
	recordId: z.uuid().optional(),
	performedBy: z.uuid().optional(),
	action: z.enum(['INSERT', 'UPDATE', 'DELETE']).optional(),
	limit: z.number().int().min(1).max(200).default(50),
	offset: z.number().int().min(0).max(100_000).default(0)
});

export function listAudit(tx: Tx, agencyId: string, input: z.input<typeof AuditFilterInput>) {
	const f = AuditFilterInput.parse(input);
	return selectAuditEntries(tx, agencyId, {
		from: f.dateRange ? new Date(f.dateRange.from) : undefined,
		to: f.dateRange ? new Date(f.dateRange.to) : undefined,
		tableName: f.tableName || undefined,
		recordId: f.recordId,
		performedBy: f.performedBy,
		action: f.action,
		limit: f.limit,
		offset: f.offset
	});
}

/** One entry with its values. The view itself is recorded. */
export async function getAudit(
	tx: Tx,
	agencyId: string,
	viewerId: string,
	id: string,
	request: RequestInfo
) {
	const entry = await selectAuditEntry(tx, agencyId, id);
	if (!entry) throw new ServiceError('NOT_FOUND', 'Audit entry not found');
	// audit_log takes no user writes (rls.sql): the trusted server records it.
	await asService(tx, (t) => recordAuditView(t, agencyId, viewerId, id, request));
	return entry;
}
