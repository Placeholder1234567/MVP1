// Home Service (services.md §13): homes and their clock-in geofence.
import { z } from 'zod';
import type { Tx } from '../../db';
import { ServiceError } from '../../errors';
import { localTime } from '../../../domain/index.ts';
import { homeInUse, insertHome, selectHome, selectHomes, updateHomeRow } from './home.queries';

export function listHomes(tx: Tx, agencyId: string) {
	return selectHomes(tx, agencyId);
}

/** null when the home doesn't exist or is outside the caller's access. */
export function getHome(tx: Tx, agencyId: string, id: string) {
	return selectHome(tx, agencyId, id);
}

const Geofence = {
	address: z.string().trim().max(300).nullable().optional(),
	lat: z.number().min(-90).max(90).nullable().optional(),
	lng: z.number().min(-180).max(180).nullable().optional(),
	/** Clock-in geofence in meters (trpc-router.md: default 150) */
	radius: z.number().int().min(25).max(5000).optional()
};

export const NewHome = z.object({ name: z.string().trim().min(1).max(100), ...Geofence });
export const HomeChanges = z.object({
	id: z.uuid(),
	name: z.string().trim().min(1).max(100).optional(),
	...Geofence
});

export function createHome(tx: Tx, agencyId: string, input: z.infer<typeof NewHome>) {
	const data = NewHome.parse(input);
	return insertHome(tx, { agency_id: agencyId, radius: 150, ...data });
}

/** Changing lat/lng/radius applies to future clock-ins only. */
export async function updateHome(tx: Tx, agencyId: string, input: z.infer<typeof HomeChanges>) {
	const { id, ...set } = HomeChanges.parse(input);
	const row = await updateHomeRow(tx, agencyId, id, set);
	if (!row) throw new ServiceError('NOT_FOUND', 'Home not found');
	return row;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Archive a home that has closed (admin). Its records stay, read-only: no new
 * clock-ins, shifts, admissions, rooms or staff assignments. Refused while
 * anyone still lives there, is clocked in there, or has a shift booked there
 * from today on, so nothing in use is stranded. Reversible with restoreHome.
 */
export async function archiveHome(tx: Tx, agencyId: string, id: string, timeZone: string) {
	const home = await selectHome(tx, agencyId, id);
	if (!home) throw new ServiceError('NOT_FOUND', 'Home not found');
	if (home.archivedAt) return home;
	const use = await homeInUse(tx, agencyId, id, localTime(new Date(), timeZone).day);
	const blockers = [
		use.people && `move or discharge ${plural(use.people, 'person', 'people')} living there`,
		use.onClock && `wait for ${plural(use.onClock, 'staff member', 'staff members')} to clock out`,
		use.shifts && `clear ${plural(use.shifts, 'upcoming shift', 'upcoming shifts')} there`
	].filter(Boolean);
	if (blockers.length)
		throw new ServiceError('RULE_VIOLATION', `Before archiving, ${blockers.join(', ')}`);
	return (await updateHomeRow(tx, agencyId, id, { archived_at: new Date() }))!;
}

export async function restoreHome(tx: Tx, agencyId: string, id: string) {
	const row = await updateHomeRow(tx, agencyId, id, { archived_at: null });
	if (!row) throw new ServiceError('NOT_FOUND', 'Home not found');
	return row;
}

/** Throws unless the home exists and is in use: for every write that adds
 * work at a home (clock-in, shifts, admissions, rooms, assignments). */
export function requireOpenHome<T extends { archived_at?: Date | null; archivedAt?: Date | null }>(
	home: T | null | undefined,
	message = 'Home not found'
): T {
	if (!home) throw new ServiceError('NOT_FOUND', message);
	if (home.archived_at ?? home.archivedAt)
		throw new ServiceError(
			'RULE_VIOLATION',
			'This home is archived. An admin can restore it in Setup.'
		);
	return home;
}
