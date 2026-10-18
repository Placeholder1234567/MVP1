// API report queries (openapi.yaml /reports/{type}). Each type reads one
// period by its own date: incidents by when they happened, notes, MAR and
// attendance by their day, goal trials by their note's day, timesheets by
// clock-in, the audit log by when it was written. Every query is scoped by
// agency_id; columns reuse the bulk export lists so nothing internal leaves.
import { and, asc, eq, gte, inArray, isNotNull, lt, lte, or, type SQL } from 'drizzle-orm';
import type { Tx } from '../../db';
import {
	auditLog,
	clockRecords,
	homes,
	noteGoals,
	notes,
	profiles,
	reportJobs
} from '../../db/schema';
import { EXPORTS } from './export.queries';

export const REPORT_ROW_LIMIT = 50_000;
/** PDFs print one block per record; past this they're too long to read. */
export const PDF_ROW_LIMIT = 2_000;

/** CSV columns per type, so an empty report still has its header. */
export const REPORT_COLUMNS: Record<string, string[]> = {
	incidents: Object.keys(EXPORTS.incidents.columns),
	notes: Object.keys(EXPORTS.notes.columns),
	mar: Object.keys(EXPORTS.mar.columns),
	attendance: Object.keys(EXPORTS.attendance.columns),
	goals: [
		'id',
		'note_id',
		'goal_id',
		'client_id',
		'home_id',
		'day',
		'note_status',
		'trials',
		'not_attempted',
		'reason'
	],
	timesheets: [
		'id',
		'profile_id',
		'staff_name',
		'home_id',
		'home_name',
		'clock_in_at',
		'clock_out_at',
		'verified',
		'manual_override',
		'hours'
	],
	audit: ['id', 'table_name', 'record_id', 'action', 'performed_by', 'created_at']
};

export interface ReportFilter {
	agencyId: string;
	/** Inclusive local days, and the instants they span in the agency's time zone */
	fromDay: string;
	toDay: string;
	start: Date;
	end: Date;
	homeId: string | null;
	clientId: string | null;
}

type Rows = Record<string, unknown>[];

const byDay = (column: Parameters<typeof gte>[0], f: ReportFilter) => [
	gte(column, f.fromDay),
	lte(column, f.toDay)
];

async function clinical(
	tx: Tx,
	type: 'incidents' | 'notes' | 'mar' | 'attendance',
	f: ReportFilter
): Promise<Rows> {
	const def = EXPORTS[type];
	const cols = def.columns as Record<string, Parameters<typeof eq>[0]>;
	const where: SQL[] = [eq(def.agency, f.agencyId)];
	if (type === 'incidents') where.push(gte(cols.occurred_at, f.start), lt(cols.occurred_at, f.end));
	else where.push(...byDay(cols.day, f));
	if (f.homeId) where.push(eq(cols.home_id, f.homeId));
	if (f.clientId) where.push(eq(cols.client_id, f.clientId));
	return (await tx
		.select(def.columns)
		.from(def.table)
		.where(and(...where))
		.orderBy(asc(type === 'incidents' ? cols.occurred_at : cols.day), asc(def.id))
		.limit(REPORT_ROW_LIMIT + 1)) as Rows;
}

function goalTrials(tx: Tx, f: ReportFilter) {
	const where: SQL[] = [eq(noteGoals.agency_id, f.agencyId), ...byDay(notes.day, f)];
	if (f.homeId) where.push(eq(notes.home_id, f.homeId));
	if (f.clientId) where.push(eq(notes.client_id, f.clientId));
	return tx
		.select({
			id: noteGoals.id,
			note_id: noteGoals.note_id,
			goal_id: noteGoals.goal_id,
			client_id: notes.client_id,
			home_id: notes.home_id,
			day: notes.day,
			note_status: notes.status,
			trials: noteGoals.trials,
			not_attempted: noteGoals.not_attempted,
			reason: noteGoals.reason
		})
		.from(noteGoals)
		.innerJoin(
			notes,
			and(eq(notes.id, noteGoals.note_id), eq(notes.agency_id, noteGoals.agency_id))
		)
		.where(and(...where))
		.orderBy(asc(notes.day), asc(noteGoals.id))
		.limit(REPORT_ROW_LIMIT + 1);
}

async function timesheets(tx: Tx, f: ReportFilter): Promise<Rows> {
	const where: SQL[] = [
		eq(clockRecords.agency_id, f.agencyId),
		gte(clockRecords.clock_in_at, f.start),
		lt(clockRecords.clock_in_at, f.end)
	];
	if (f.homeId) where.push(eq(clockRecords.home_id, f.homeId));
	const rows = await tx
		.select({
			id: clockRecords.id,
			profile_id: clockRecords.profile_id,
			staff_name: profiles.name,
			home_id: clockRecords.home_id,
			home_name: homes.name,
			clock_in_at: clockRecords.clock_in_at,
			clock_out_at: clockRecords.clock_out_at,
			verified: clockRecords.verified,
			manual_override: clockRecords.manual_override
		})
		.from(clockRecords)
		.innerJoin(
			profiles,
			and(eq(profiles.id, clockRecords.profile_id), eq(profiles.agency_id, clockRecords.agency_id))
		)
		.innerJoin(
			homes,
			and(eq(homes.id, clockRecords.home_id), eq(homes.agency_id, clockRecords.agency_id))
		)
		.where(and(...where))
		.orderBy(asc(clockRecords.clock_in_at), asc(clockRecords.id))
		.limit(REPORT_ROW_LIMIT + 1);
	return rows.map((r) => ({
		...r,
		hours: r.clock_out_at
			? Math.round(((r.clock_out_at.getTime() - r.clock_in_at.getTime()) / 3_600_000) * 100) / 100
			: null
	}));
}

/** Audit metadata only (who, what, when), as audit.list shows; never old or new values. */
function audit(tx: Tx, f: ReportFilter) {
	return tx
		.select({
			id: auditLog.id,
			table_name: auditLog.table_name,
			record_id: auditLog.record_id,
			action: auditLog.action,
			performed_by: auditLog.performed_by,
			created_at: auditLog.created_at
		})
		.from(auditLog)
		.where(
			and(
				eq(auditLog.agency_id, f.agencyId),
				gte(auditLog.created_at, f.start),
				lt(auditLog.created_at, f.end)
			)
		)
		.orderBy(asc(auditLog.created_at), asc(auditLog.id))
		.limit(REPORT_ROW_LIMIT + 1);
}

export function reportRows(tx: Tx, type: string, f: ReportFilter): Promise<Rows> {
	switch (type) {
		case 'incidents':
		case 'notes':
		case 'mar':
		case 'attendance':
			return clinical(tx, type, f);
		case 'goals':
			return goalTrials(tx, f) as Promise<Rows>;
		case 'timesheets':
			return timesheets(tx, f);
		case 'audit':
			return audit(tx, f) as Promise<Rows>;
		default:
			throw new Error('Unknown report type');
	}
}

// ─── Jobs ───────────────────────────────────────────────────────────────────

export async function insertJob(tx: Tx, row: typeof reportJobs.$inferInsert) {
	const [job] = await tx.insert(reportJobs).values(row).returning();
	return job;
}

export async function jobById(tx: Tx, agencyId: string | null, id: string) {
	const [job] = await tx
		.select()
		.from(reportJobs)
		.where(
			agencyId
				? and(eq(reportJobs.agency_id, agencyId), eq(reportJobs.id, id))
				: eq(reportJobs.id, id)
		);
	return job ?? null;
}

export async function setJob(
	tx: Tx,
	id: string,
	set: Partial<
		Pick<
			typeof reportJobs.$inferInsert,
			'status' | 'storage_path' | 'ready_at' | 'expires_at' | 'error' | 'params'
		>
	>
) {
	await tx
		.update(reportJobs)
		.set({ ...set, updated_at: new Date() })
		.where(eq(reportJobs.id, id));
}

/** Ready reports past their expiry (any agency; the cleanup job runs as app_service). */
export function expiredJobs(tx: Tx, now: Date) {
	return tx
		.select({ id: reportJobs.id, path: reportJobs.storage_path })
		.from(reportJobs)
		.where(
			and(
				or(
					eq(reportJobs.status, 'ready'),
					and(
						isNotNull(reportJobs.requested_by),
						inArray(reportJobs.status, ['queued', 'processing', 'failed'])
					)
				),
				lt(reportJobs.expires_at, now),
				isNotNull(reportJobs.storage_path)
			)
		)
		.limit(500);
}
