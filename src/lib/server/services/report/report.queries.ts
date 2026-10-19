import type { Tx, RequestInfo } from '../../db';
import { and, eq, inArray } from 'drizzle-orm';
import { auditLog, profiles, homes } from '../../db/schema';

export async function payrollLabels(
	tx: Tx,
	agencyId: string,
	staffIds: string[],
	homeIds: string[]
) {
	const staff = staffIds.length
		? await tx
				.select({ id: profiles.id, name: profiles.name })
				.from(profiles)
				.where(and(eq(profiles.agency_id, agencyId), inArray(profiles.id, staffIds)))
		: [];
	const home = homeIds.length
		? await tx
				.select({ id: homes.id, name: homes.name })
				.from(homes)
				.where(and(eq(homes.agency_id, agencyId), inArray(homes.id, homeIds)))
		: [];
	return {
		staff: new Map(staff.map((r) => [r.id, r.name])),
		homes: new Map(home.map((r) => [r.id, r.name]))
	};
}

/** Called with elevated write permission only after the RLS-scoped report has completed. */
export async function recordExport(
	tx: Tx,
	agencyId: string,
	profileId: string,
	format: string,
	rows: number,
	request: RequestInfo,
	type = 'timesheets',
	/**
	 * What the file covers (home, person, period) and whose records are in it,
	 * so a lost download can be traced to the people affected. IDs only.
	 */
	scope: Record<string, unknown> = {}
) {
	await tx.insert(auditLog).values({
		agency_id: agencyId,
		table_name: 'report_exports',
		record_id: crypto.randomUUID(),
		action: 'INSERT',
		performed_by: profileId,
		ip_address: request.ip,
		user_agent: request.user_agent,
		new_values: { type, format, rows, ...scope }
	});
}
