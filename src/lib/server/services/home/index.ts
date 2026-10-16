// Home Service (services.md §13): homes and their clock-in geofence.
import { z } from 'zod';
import type { Tx } from '../../db';
import { ServiceError } from '../../errors';
import { insertHome, selectHome, selectHomes, updateHomeRow } from './home.queries';

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
