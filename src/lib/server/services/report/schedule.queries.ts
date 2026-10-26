import { and, asc, eq, lte } from 'drizzle-orm';
import type { Tx } from '../../db';
import { agencies, profiles, reportSchedules } from '../../db/schema';

const columns = {
	id: reportSchedules.id,
	homeId: reportSchedules.home_id,
	type: reportSchedules.type,
	format: reportSchedules.format,
	frequency: reportSchedules.frequency,
	weekday: reportSchedules.weekday,
	approvedOnly: reportSchedules.approved_only,
	active: reportSchedules.active,
	nextRunOn: reportSchedules.next_run_on,
	lastRunOn: reportSchedules.last_run_on,
	lastReportId: reportSchedules.last_report_id,
	createdAt: reportSchedules.created_at
};

// Runs as app_user: owners see only their own (report_schedules_select).
export function selectOwnSchedules(tx: Tx, agencyId: string, profileId: string) {
	return tx
		.select(columns)
		.from(reportSchedules)
		.where(and(eq(reportSchedules.agency_id, agencyId), eq(reportSchedules.profile_id, profileId)))
		.orderBy(asc(reportSchedules.created_at));
}

export async function insertSchedule(tx: Tx, row: typeof reportSchedules.$inferInsert) {
	const [created] = await tx.insert(reportSchedules).values(row).returning(columns);
	return created;
}

export async function deleteOwnSchedule(tx: Tx, agencyId: string, profileId: string, id: string) {
	const rows = await tx
		.delete(reportSchedules)
		.where(
			and(
				eq(reportSchedules.agency_id, agencyId),
				eq(reportSchedules.profile_id, profileId),
				eq(reportSchedules.id, id)
			)
		)
		.returning({ id: reportSchedules.id });
	return rows.length > 0;
}

/** Active schedules due by `latestDay` (the latest local day of any agency), with the agency's zone. */
export function dueSchedules(tx: Tx, latestDay: string, limit: number) {
	return tx
		.select({
			...columns,
			agencyId: reportSchedules.agency_id,
			profileId: reportSchedules.profile_id,
			timeZone: agencies.timezone
		})
		.from(reportSchedules)
		.innerJoin(agencies, eq(agencies.id, reportSchedules.agency_id))
		.where(and(eq(reportSchedules.active, true), lte(reportSchedules.next_run_on, latestDay)))
		.orderBy(asc(reportSchedules.next_run_on))
		.limit(limit);
}

/** Moves a schedule on, only if nobody else has (the claim for this run). Runs as app_service. */
export async function claimRun(tx: Tx, id: string, expected: string, next: string, today: string) {
	const rows = await tx
		.update(reportSchedules)
		.set({ next_run_on: next, last_run_on: today, updated_at: new Date() })
		.where(
			and(
				eq(reportSchedules.id, id),
				eq(reportSchedules.next_run_on, expected),
				eq(reportSchedules.active, true)
			)
		)
		.returning({ id: reportSchedules.id });
	return rows.length > 0;
}

/** A stopped schedule of this owner, on again from `next`. Runs as app_service. */
export async function reactivateSchedule(
	tx: Tx,
	agencyId: string,
	profileId: string,
	id: string,
	next: string
) {
	const [row] = await tx
		.update(reportSchedules)
		.set({ active: true, next_run_on: next, updated_at: new Date() })
		.where(
			and(
				eq(reportSchedules.agency_id, agencyId),
				eq(reportSchedules.profile_id, profileId),
				eq(reportSchedules.id, id)
			)
		)
		.returning(columns);
	return row;
}

/** Undoes a claim whose report could not be queued, so the next sweep tries again. */
export async function releaseRun(
	tx: Tx,
	id: string,
	claimed: string,
	previous: string,
	lastRunOn: string | null
) {
	await tx
		.update(reportSchedules)
		.set({ next_run_on: previous, last_run_on: lastRunOn, updated_at: new Date() })
		.where(and(eq(reportSchedules.id, id), eq(reportSchedules.next_run_on, claimed)));
}

/** After a run: the report it made, or switched off when the owner lost access. */
export async function finishRun(
	tx: Tx,
	id: string,
	result: { reportId: string } | { inactive: true }
) {
	await tx
		.update(reportSchedules)
		.set(
			'reportId' in result
				? { last_report_id: result.reportId, updated_at: new Date() }
				: { active: false, updated_at: new Date() }
		)
		.where(eq(reportSchedules.id, id));
}

/** The role of a report's owner, for their alert (null once they have left). */
export async function ownerRole(tx: Tx, agencyId: string, profileId: string) {
	const [row] = await tx
		.select({ role: profiles.role })
		.from(profiles)
		.where(
			and(eq(profiles.agency_id, agencyId), eq(profiles.id, profileId), eq(profiles.active, true))
		)
		.limit(1);
	return row?.role ?? null;
}
