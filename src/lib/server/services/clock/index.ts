import { z } from 'zod';
import { asService, withService, type Tx } from '../../db';
import { ServiceError } from '../../errors';
import type { CurrentUser } from '../auth/index.ts';
import { requireOpenHome } from '../home/index.ts';
import { notify, notifyHomeSupervisors } from '../notification/index.ts';
import {
	activeClock,
	clockHome,
	clockRows,
	findClock,
	insertClock,
	lockClockOwner,
	updateClock
} from './clock.queries';
import { overlappingClock, missedClocks, hasClockAlert } from './clock.queries';

export const Position = {
	lat: z.number().min(-90).max(90).optional(),
	lng: z.number().min(-180).max(180).optional()
};
export const NewClock = z
	.object({
		id: z.uuid(),
		homeId: z.uuid(),
		...Position,
		accuracy: z.number().min(0).max(100000).optional(),
		recordedAt: z.coerce.date().optional()
	})
	.refine((p) => (p.lat === undefined) === (p.lng === undefined), 'Both coordinates are required');
function checkTime(at: Date) {
	const delta = Date.now() - at.getTime();
	if (!Number.isFinite(delta) || delta < -300000 || delta > 30 * 86400000)
		throw new ServiceError('VALIDATION_FAILED', 'Clock time is outside the allowed range');
}
export async function clockIn(tx: Tx, user: CurrentUser, input: z.input<typeof NewClock>) {
	const p = NewClock.parse(input);
	const at = p.recordedAt ?? new Date();
	checkTime(at);
	await lockClockOwner(tx, user.agencyId, user.profileId);
	const existing = await findClock(tx, user.agencyId, p.id);
	if (existing) {
		if (existing.profile_id !== user.profileId)
			throw new ServiceError('FORBIDDEN', 'Clock record belongs to another staff member');
		return existing;
	}
	if (await activeClock(tx, user.agencyId, user.profileId))
		throw new ServiceError('RULE_VIOLATION', 'You are already clocked in');
	const home = await clockHome(tx, user.agencyId, p.homeId);
	if (!home || !user.homeIds.includes(p.homeId))
		throw new ServiceError('FORBIDDEN', 'Clock in at one of your assigned homes');
	requireOpenHome(home);
	const row = await insertClock(tx, {
		id: p.id,
		agency_id: user.agencyId,
		profile_id: user.profileId,
		home_id: p.homeId,
		clock_in_at: at,
		clock_in_lat: p.lat,
		clock_in_lng: p.lng,
		accuracy: p.accuracy
	});
	if (!row.verified)
		await notifyHomeSupervisors(tx, user.agencyId, p.homeId, {
			type: 'clock_anomaly',
			priority: 3,
			title: 'A clock-in needs location review',
			referenceId: row.id,
			referenceType: 'clock_records'
		});
	return row;
}
export async function clockOut(
	tx: Tx,
	user: CurrentUser,
	input: { id?: string; lat?: number; lng?: number; recordedAt?: Date }
) {
	await lockClockOwner(tx, user.agencyId, user.profileId);
	const row = input.id
		? await findClock(tx, user.agencyId, input.id)
		: await activeClock(tx, user.agencyId, user.profileId);
	if (!row || row.profile_id !== user.profileId)
		throw new ServiceError('NOT_FOUND', 'No active clock-in found');
	if (row.clock_out_at) return row;
	const at = input.recordedAt ?? new Date();
	checkTime(at);
	if (at < row.clock_in_at)
		throw new ServiceError('VALIDATION_FAILED', 'Clock-out must be after clock-in');
	return updateClock(tx, user.agencyId, row.id, {
		clock_out_at: at,
		clock_out_lat: input.lat,
		clock_out_lng: input.lng
	});
}
export async function acknowledgeClock(tx: Tx, user: CurrentUser, id: string) {
	if (user.role === 'caregiver') throw new ServiceError('FORBIDDEN', 'Supervisor access required');
	if (!(await findClock(tx, user.agencyId, id)))
		throw new ServiceError('NOT_FOUND', 'Clock record not found');
	return updateClock(tx, user.agencyId, id, { acknowledged: true });
}
export async function manualClock(
	tx: Tx,
	user: CurrentUser,
	input: { profileId: string; homeId: string; clockInAt: Date; clockOutAt: Date; reason: string }
) {
	if (user.role === 'caregiver') throw new ServiceError('FORBIDDEN', 'Supervisor access required');
	if (input.clockOutAt <= input.clockInAt || input.clockOutAt > new Date())
		throw new ServiceError('VALIDATION_FAILED', 'Choose a completed time range');
	const owner = await asService(tx, (t) => lockClockOwner(t, user.agencyId, input.profileId));
	const home = await clockHome(tx, user.agencyId, input.homeId);
	if (!owner?.active || !owner.homeIds?.includes(input.homeId) || !home)
		throw new ServiceError(
			'VALIDATION_FAILED',
			'Choose an active staff member assigned to this home'
		);
	// A missed punch from before the home closed can still be corrected.
	if (home.archived_at && input.clockInAt >= home.archived_at) requireOpenHome(home);
	if (await overlappingClock(tx, user.agencyId, input.profileId, input.clockInAt, input.clockOutAt))
		throw new ServiceError('RULE_VIOLATION', 'This entry overlaps an existing clock record');
	return insertClock(tx, {
		agency_id: user.agencyId,
		profile_id: input.profileId,
		home_id: input.homeId,
		clock_in_at: input.clockInAt,
		clock_out_at: input.clockOutAt,
		reason: input.reason,
		manual_override: true,
		acknowledged: false
	});
}
export const listClocks = (
	tx: Tx,
	user: CurrentUser,
	filter: { homeId?: string; profileId?: string; from?: Date; to?: Date }
) =>
	clockRows(tx, user.agencyId, {
		...filter,
		limit: 500,
		profileId: user.role === 'caregiver' ? user.profileId : filter.profileId
	});
export async function timesheet(
	tx: Tx,
	user: CurrentUser,
	filter: { homeId?: string; profileId?: string; from: Date; to: Date }
) {
	if (user.role === 'caregiver') throw new ServiceError('FORBIDDEN', 'Supervisor access required');
	const span = filter.to.getTime() - filter.from.getTime();
	if (!Number.isFinite(span) || span <= 0 || span > 366 * 86400000)
		throw new ServiceError('VALIDATION_FAILED', 'Choose a range of one year or less');
	const entries = await clockRows(tx, user.agencyId, { ...filter, overlap: true, limit: 5001 });
	if (entries.length > 5000)
		throw new ServiceError(
			'VALIDATION_FAILED',
			'Too many entries. Choose a shorter period or one home.'
		);
	const totals = { totalHours: 0, verifiedHours: 0, unverifiedHours: 0, manualHours: 0 };
	for (const row of entries) {
		if (!row.clock_out_at) continue;
		const hours =
			Math.max(
				0,
				Math.min(row.clock_out_at.getTime(), filter.to.getTime()) -
					Math.max(row.clock_in_at.getTime(), filter.from.getTime())
			) / 3600000;
		totals.totalHours += hours;
		if (row.manual_override) totals.manualHours += hours;
		else if (row.verified) totals.verifiedHours += hours;
		else totals.unverifiedHours += hours;
	}
	return { entries, ...totals };
}
export async function checkMissedPunches() {
	const rows = await withService(missedClocks);
	let flagged = 0;
	for (const row of rows)
		await withService(async (tx) => {
			await lockClockOwner(tx, row.agencyId, row.profileId);
			const current = await findClock(tx, row.agencyId, row.id);
			if (!current || current.clock_out_at || (await hasClockAlert(tx, row.agencyId, row.id)))
				return;
			await notify(tx, row.agencyId, [{ id: row.profileId, role: 'caregiver' }], {
				type: 'clock_missed',
				priority: 3,
				title: 'Please check your clock-out',
				referenceId: row.id,
				referenceType: 'clock_records'
			});
			await notifyHomeSupervisors(tx, row.agencyId, row.homeId, {
				type: 'clock_missed',
				priority: 3,
				title: 'A clock-out needs review',
				referenceId: row.id,
				referenceType: 'clock_records'
			});
			flagged++;
		});
	return { flagged };
}
