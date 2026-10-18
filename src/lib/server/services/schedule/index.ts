import {
	addDays,
	planWeekCopy,
	shiftAt,
	shiftIsPast,
	type CopySkip
} from '../../../domain/index.ts';
import { asService, type Tx } from '../../db';
import { ServiceError } from '../../errors';
import type { CurrentUser } from '../auth/index.ts';
import {
	conflictingSlot,
	saveSlot,
	scheduleHome,
	scheduleStaff,
	staffShifts,
	weekSlots
} from './schedule.queries';
import { settleCoverage } from './coverage';
import { requestById } from './coverage.queries';
export {
	startCoverage,
	searchCoverage,
	respondCoverage,
	coverageOffers,
	coverageTimer,
	sweepCoverage
} from './coverage';

export async function getSchedule(tx: Tx, agencyId: string, homeId: string, weekStart: string) {
	if (!(await scheduleHome(tx, agencyId, homeId)))
		throw new ServiceError('NOT_FOUND', 'Home not found');
	return { slots: await weekSlots(tx, agencyId, homeId, weekStart, addDays(weekStart, 6)) };
}
export const myShifts = (
	tx: Tx,
	agencyId: string,
	profileId: string,
	from: string,
	weeks: number
) => staffShifts(tx, agencyId, profileId, from, addDays(from, weeks * 7 - 1));
export async function setScheduleSlot(
	tx: Tx,
	user: CurrentUser,
	input: { homeId: string; day: string; shift: 'am' | 'pm' | 'on'; profileId: string | null }
) {
	if (user.role === 'caregiver') throw new ServiceError('FORBIDDEN', 'Supervisor access required');
	if (!(await scheduleHome(tx, user.agencyId, input.homeId)))
		throw new ServiceError('NOT_FOUND', 'Home not found');
	if (input.profileId) {
		const staff = await asService(tx, (t) => scheduleStaff(t, user.agencyId, input.profileId!));
		if (!staff?.active || !staff.home_ids?.includes(input.homeId))
			throw new ServiceError(
				'VALIDATION_FAILED',
				'Choose an active staff member trained at this home'
			);
		if (
			await conflictingSlot(
				tx,
				user.agencyId,
				input.profileId,
				input.homeId,
				input.day,
				input.shift
			)
		)
			throw new ServiceError(
				'RULE_VIOLATION',
				'This staff member is already assigned to another home for that shift'
			);
	}
	const row = await saveSlot(tx, user.agencyId, input);
	await settleCoverage(tx, user.agencyId, input, input.profileId);
	return row;
}

/**
 * Copies one week's assignments into another week at the same home
 * (schedule.copyWeek). Only open slots are filled; each copy is checked like
 * a manual assignment, so someone no longer active, trained here or free
 * that shift is skipped instead of failing the whole week.
 */
export async function copyScheduleWeek(
	tx: Tx,
	user: CurrentUser,
	input: { homeId: string; fromWeek: string; toWeek: string }
) {
	if (user.role === 'caregiver') throw new ServiceError('FORBIDDEN', 'Supervisor access required');
	const apart = (Date.parse(input.toWeek) - Date.parse(input.fromWeek)) / 86_400_000;
	if (!apart || apart % 7 !== 0)
		throw new ServiceError(
			'VALIDATION_FAILED',
			'Copy from a different week, starting on the same weekday'
		);
	if (!(await scheduleHome(tx, user.agencyId, input.homeId)))
		throw new ServiceError('NOT_FOUND', 'Home not found');
	const week = (start: string) =>
		weekSlots(tx, user.agencyId, input.homeId, start, addDays(start, 6)).then((rows) =>
			rows.map((r) => ({ day: r.day, shift: r.shift, assignedTo: r.assigned_to, status: r.status }))
		);
	const now = new Date();
	const plan = planWeekCopy(
		await week(input.fromWeek),
		await week(input.toWeek),
		input.fromWeek,
		input.toWeek,
		(day, shift) =>
			shiftIsPast(day, shift, now, user.timeZone) || startedNow(day, shift, now, user.timeZone)
	);
	const skipped: { day: string; shift: 'am' | 'pm' | 'on'; reason: CopySkip | 'unavailable' }[] = [
		...plan.skipped
	];
	let copied = 0;
	for (const slot of plan.copy) {
		try {
			// A savepoint per slot: one unavailable person doesn't undo the rest.
			await tx.transaction((sp) => setScheduleSlot(sp, user, { homeId: input.homeId, ...slot }));
			copied++;
		} catch (e) {
			if (!(e instanceof ServiceError)) throw e;
			skipped.push({ day: slot.day, shift: slot.shift, reason: 'unavailable' });
		}
	}
	return { copied, skipped };
}

/** The shift running right now has started; copying into it would rewrite who is on. */
function startedNow(day: string, shift: 'am' | 'pm' | 'on', now: Date, timeZone: string) {
	const current = shiftAt(now, timeZone);
	return current.day === day && current.shift === shift;
}

/** A coverage request's status (for replies that arrive after it closed). */
export async function coverageStatus(tx: Tx, agencyId: string, id: string) {
	return (await requestById(tx, agencyId, id))?.status ?? null;
}
