import { and, asc, count, eq, gte, lt, type SQL } from 'drizzle-orm';
import type { Tx } from '../../db';
import { clockRecords, homes, profiles } from '../../db/schema';

export interface VisitFilter {
	agencyId: string;
	start?: Date;
	end?: Date;
	homeId?: string | null;
	profileId?: string | null;
	verifiedOnly?: boolean;
	id?: string;
}

function where(f: VisitFilter) {
	const w: SQL[] = [eq(clockRecords.agency_id, f.agencyId)];
	if (f.start) w.push(gte(clockRecords.clock_in_at, f.start));
	if (f.end) w.push(lt(clockRecords.clock_in_at, f.end));
	if (f.homeId) w.push(eq(clockRecords.home_id, f.homeId));
	if (f.profileId) w.push(eq(clockRecords.profile_id, f.profileId));
	if (f.verifiedOnly) w.push(eq(clockRecords.verified, true));
	if (f.id) w.push(eq(clockRecords.id, f.id));
	return and(...w);
}

export function selectVisits(tx: Tx, f: VisitFilter, limit: number, offset: number) {
	return tx
		.select({
			id: clockRecords.id,
			profileId: clockRecords.profile_id,
			profileName: profiles.name,
			homeId: clockRecords.home_id,
			homeName: homes.name,
			homeAddress: homes.address,
			clockInAt: clockRecords.clock_in_at,
			clockOutAt: clockRecords.clock_out_at,
			verified: clockRecords.verified,
			manualOverride: clockRecords.manual_override,
			lat: clockRecords.clock_in_lat,
			lng: clockRecords.clock_in_lng,
			distance: clockRecords.distance_meters,
			homeLat: homes.lat,
			homeLng: homes.lng,
			homeRadius: homes.radius
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
		.where(where(f))
		.orderBy(asc(clockRecords.clock_in_at), asc(clockRecords.id))
		.limit(limit)
		.offset(offset);
}

export async function countVisits(tx: Tx, f: VisitFilter, verified?: boolean) {
	const [row] = await tx
		.select({ n: count() })
		.from(clockRecords)
		.where(verified === undefined ? where(f) : and(where(f), eq(clockRecords.verified, verified)));
	return Number(row?.n ?? 0);
}
