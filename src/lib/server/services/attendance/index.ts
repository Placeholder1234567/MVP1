// Attendance Service (services.md): daily services per person, for billing.
import { z } from 'zod';
import { addDays, ATTENDANCE_SERVICES, localTime } from '../../../domain/index.ts';
import { asService, type Tx } from '../../db';
import { ServiceError } from '../../errors';
import type { CurrentUser } from '../auth/index.ts';
import { findVisibleClient } from '../charting/index.ts';
import {
	findAttendance,
	selectAttendance,
	upsertAttendance,
	type AttendanceFilter
} from './attendance.queries';

export const AttendanceEntry = z.object({
	id: z.uuid().optional(),
	clientId: z.uuid(),
	day: z.iso.date(),
	services: z.array(z.enum(ATTENDANCE_SERVICES)).min(1, 'Pick at least one service').max(10)
});

/**
 * Records the day's services (attendance.save). If someone already recorded
 * this person's day, the services are merged, never replaced. The caller must
 * be able to see the person (RLS); the merge itself runs as app_service
 * because caregivers can't update others' rows, and the audit trigger still
 * records the caller.
 */
export async function saveAttendance(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	input: z.input<typeof AttendanceEntry>
) {
	const a = AttendanceEntry.parse(input);
	const today = localTime(new Date(), user.timeZone).day;
	if (a.day > today || a.day < addDays(today, -30)) {
		throw new ServiceError(
			'VALIDATION_FAILED',
			'Attendance can only be recorded for the last 30 days'
		);
	}
	if (!(await findVisibleClient(tx, agencyId, a.clientId))) {
		throw new ServiceError('NOT_FOUND', 'That person is not in your homes');
	}
	return asService(tx, (t) =>
		upsertAttendance(t, {
			...(a.id ? { id: a.id } : {}),
			agency_id: agencyId,
			client_id: a.clientId,
			day: a.day,
			services: [...new Set(a.services)].sort(),
			recorded_at: new Date(),
			recorded_by: user.profileId,
			recorded_by_name: user.name,
			created_by: user.profileId
		})
	);
}

export function listAttendance(tx: Tx, agencyId: string, filter: AttendanceFilter) {
	return selectAttendance(tx, agencyId, filter);
}

/** The person and day of an existing attendance record (for edits that only send services). */
export function findAttendanceDay(tx: Tx, agencyId: string, id: string) {
	return findAttendance(tx, agencyId, id);
}
