import { and, eq, lt } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { Tx } from '../../db';
import * as s from '../../db/schema';

/** Each windowed table, the column that dates a row, and how many days devices keep it (offline-sync.md §7). */
const WINDOWS: Array<
	[name: string, table: PgTable & { device_sync: PgColumn }, column: PgColumn, days: number]
> = [
	// Clinical records: 30 days
	['notes', s.notes, s.notes.day, 30],
	['note_goals', s.noteGoals, s.noteGoals.created_at, 30],
	['incidents', s.incidents, s.incidents.occurred_at, 30],
	['mar_records', s.marRecords, s.marRecords.day, 30],
	['health_entries', s.healthEntries, s.healthEntries.recorded_at, 30],
	['attendance', s.attendance, s.attendance.day, 30],
	['clock_records', s.clockRecords, s.clockRecords.clock_in_at, 30],
	// Transient: 7 days
	['notifications', s.notifications, s.notifications.created_at, 7],
	['coverage_requests', s.coverageRequests, s.coverageRequests.created_at, 7],
	['coverage_steps', s.coverageSteps, s.coverageSteps.created_at, 7],
	// Schedule keeps the past 30 days (future slots always sync); messages 90 days
	['schedule_slots', s.scheduleSlots, s.scheduleSlots.day, 30],
	['messages', s.messages, s.messages.sent_at, 90]
];

export async function expireDeviceRows(tx: Tx, now: Date): Promise<Record<string, number>> {
	const changed: Record<string, number> = {};
	for (const [name, table, column, days] of WINDOWS) {
		const cutoff = new Date(now.getTime() - days * 86_400_000);
		const value = column.columnType === 'PgDateString' ? cutoff.toISOString().slice(0, 10) : cutoff;
		const res = await tx
			.update(table)
			.set({ device_sync: false } as never)
			.where(and(eq(table.device_sync, true), lt(column, value)));
		changed[name] = res.rowCount ?? 0;
	}
	return changed;
}
