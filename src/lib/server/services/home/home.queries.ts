import { and, asc, count, eq, gte, isNotNull, isNull } from 'drizzle-orm';
import type { Tx } from '../../db';
import { clients, clockRecords, coverageRequests, homes, scheduleSlots } from '../../db/schema';

const columns = {
	id: homes.id,
	name: homes.name,
	address: homes.address,
	lat: homes.lat,
	lng: homes.lng,
	radius: homes.radius,
	archivedAt: homes.archived_at,
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

/** What still ties a home to day-to-day work: people living there, staff on
 * the clock there, and shifts from `today` on that are staffed or still
 * looking for cover. Empty slots don't count. */
export async function homeInUse(tx: Tx, agencyId: string, id: string, today: string) {
	const [people] = await tx
		.select({ n: count() })
		.from(clients)
		.where(and(eq(clients.agency_id, agencyId), eq(clients.home_id, id), eq(clients.active, true)));
	const [onClock] = await tx
		.select({ n: count() })
		.from(clockRecords)
		.where(
			and(
				eq(clockRecords.agency_id, agencyId),
				eq(clockRecords.home_id, id),
				isNull(clockRecords.clock_out_at)
			)
		);
	const [shifts] = await tx
		.select({ n: count() })
		.from(scheduleSlots)
		.where(
			and(
				eq(scheduleSlots.agency_id, agencyId),
				eq(scheduleSlots.home_id, id),
				gte(scheduleSlots.day, today),
				isNotNull(scheduleSlots.assigned_to)
			)
		);
	const [searching] = await tx
		.select({ n: count() })
		.from(coverageRequests)
		.where(
			and(
				eq(coverageRequests.agency_id, agencyId),
				eq(coverageRequests.home_id, id),
				gte(coverageRequests.day, today),
				eq(coverageRequests.status, 'searching')
			)
		);
	return { people: people.n, onClock: onClock.n, shifts: shifts.n + searching.n };
}
