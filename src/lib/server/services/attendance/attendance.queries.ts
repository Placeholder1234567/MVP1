import { and, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import type { Tx } from '../../db';
import { attendance, clients } from '../../db/schema';

/**
 * Inserts the day's attendance, or merges the services into the existing row
 * (union, never replace: attendance is a billing record). Unique on (client_id, day).
 */
export async function upsertAttendance(tx: Tx, row: typeof attendance.$inferInsert) {
	const [saved] = await tx
		.insert(attendance)
		.values(row)
		.onConflictDoUpdate({
			target: [attendance.client_id, attendance.day],
			set: {
				services: sql`ARRAY(SELECT DISTINCT unnest(coalesce(${attendance.services}, '{}') || excluded.services) ORDER BY 1)`,
				updated_at: new Date()
			}
		})
		.returning({
			id: attendance.id,
			clientId: attendance.client_id,
			day: attendance.day,
			services: attendance.services,
			recordedAt: attendance.recorded_at
		});
	return saved;
}

export interface AttendanceFilter {
	clientId?: string;
	homeId?: string;
	from?: string;
	to?: string;
}

export function selectAttendance(tx: Tx, agencyId: string, f: AttendanceFilter) {
	const where: SQL[] = [eq(attendance.agency_id, agencyId)];
	if (f.clientId) where.push(eq(attendance.client_id, f.clientId));
	if (f.homeId) where.push(eq(attendance.home_id, f.homeId));
	if (f.from) where.push(gte(attendance.day, f.from));
	if (f.to) where.push(lte(attendance.day, f.to));
	return tx
		.select({
			id: attendance.id,
			clientId: attendance.client_id,
			clientName: clients.name,
			day: attendance.day,
			services: attendance.services,
			recordedAt: attendance.recorded_at,
			recordedByName: attendance.recorded_by_name
		})
		.from(attendance)
		.innerJoin(clients, eq(clients.id, attendance.client_id))
		.where(and(...where))
		.orderBy(desc(attendance.day))
		.limit(500);
}

export async function findAttendance(tx: Tx, agencyId: string, id: string) {
	const [row] = await tx
		.select({ clientId: attendance.client_id, day: attendance.day })
		.from(attendance)
		.where(and(eq(attendance.agency_id, agencyId), eq(attendance.id, id)))
		.limit(1);
	return row ?? null;
}
