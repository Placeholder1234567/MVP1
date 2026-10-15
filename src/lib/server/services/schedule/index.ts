import { addDays } from '../../../domain/index.ts';
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

/** A coverage request's status (for replies that arrive after it closed). */
export async function coverageStatus(tx: Tx, agencyId: string, id: string) {
	return (await requestById(tx, agencyId, id))?.status ?? null;
}
