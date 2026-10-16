import { and, asc, eq } from 'drizzle-orm';
import type { Tx } from '../../db';
import { homes } from '../../db/schema';

const columns = {
	id: homes.id,
	name: homes.name,
	address: homes.address,
	lat: homes.lat,
	lng: homes.lng,
	radius: homes.radius,
	createdAt: homes.created_at,
	updatedAt: homes.updated_at
};

// Runs as app_user: the homes_select policy already limits caregivers to
// their assigned homes, so no home filter is repeated here.
export function selectHomes(tx: Tx, agencyId: string) {
	return tx
		.select(columns)
		.from(homes)
		.where(eq(homes.agency_id, agencyId))
		.orderBy(asc(homes.name));
}

export async function selectHome(tx: Tx, agencyId: string, id: string) {
	const [row] = await tx
		.select(columns)
		.from(homes)
		.where(and(eq(homes.agency_id, agencyId), eq(homes.id, id)))
		.limit(1);
	return row ?? null;
}

export async function insertHome(tx: Tx, row: typeof homes.$inferInsert) {
	const [created] = await tx.insert(homes).values(row).returning(columns);
	return created;
}

export async function updateHomeRow(
	tx: Tx,
	agencyId: string,
	id: string,
	set: Partial<typeof homes.$inferInsert>
) {
	const [row] = await tx
		.update(homes)
		.set({ ...set, updated_at: new Date() })
		.where(and(eq(homes.agency_id, agencyId), eq(homes.id, id)))
		.returning(columns);
	return row ?? null;
}
