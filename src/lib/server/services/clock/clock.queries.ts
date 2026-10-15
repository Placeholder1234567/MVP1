import { and, desc, eq, gt, gte, isNull, lt, lte, or } from 'drizzle-orm';
import type { Tx } from '../../db';
import { clockRecords, homes, profiles, notifications } from '../../db/schema';

export async function lockClockOwner(tx: Tx, agencyId: string, profileId: string) {
	return (
		await tx
			.select({ id: profiles.id, homeIds: profiles.home_ids, active: profiles.active })
			.from(profiles)
			.where(and(eq(profiles.agency_id, agencyId), eq(profiles.id, profileId)))
			.for('update')
	)[0];
}
export async function clockHome(tx: Tx, agencyId: string, id: string) {
	return (
		await tx
			.select()
			.from(homes)
			.where(and(eq(homes.agency_id, agencyId), eq(homes.id, id)))
	)[0];
}
export async function activeClock(tx: Tx, agencyId: string, profileId: string) {
	return (
		await tx
			.select()
			.from(clockRecords)
			.where(
				and(
					eq(clockRecords.agency_id, agencyId),
					eq(clockRecords.profile_id, profileId),
					isNull(clockRecords.clock_out_at)
				)
			)
			.for('update')
	)[0];
}
export async function findClock(tx: Tx, agencyId: string, id: string) {
	return (
		await tx
			.select()
			.from(clockRecords)
			.where(and(eq(clockRecords.agency_id, agencyId), eq(clockRecords.id, id)))
	)[0];
}
export async function insertClock(tx: Tx, row: typeof clockRecords.$inferInsert) {
	return (await tx.insert(clockRecords).values(row).returning())[0];
}
export async function updateClock(
	tx: Tx,
	agencyId: string,
	id: string,
	set: Partial<
		Pick<
			typeof clockRecords.$inferInsert,
			'clock_out_at' | 'clock_out_lat' | 'clock_out_lng' | 'acknowledged'
		>
	>
) {
	return (
		await tx
			.update(clockRecords)
			.set({ ...set, updated_at: new Date() })
			.where(and(eq(clockRecords.agency_id, agencyId), eq(clockRecords.id, id)))
			.returning()
	)[0];
}
export function clockRows(
	tx: Tx,
	agencyId: string,
	filter: {
		homeId?: string;
		profileId?: string;
		from?: Date;
		to?: Date;
		overlap?: boolean;
		limit?: number;
	}
) {
	const query = tx
		.select()
		.from(clockRecords)
		.where(
			and(
				eq(clockRecords.agency_id, agencyId),
				filter.homeId ? eq(clockRecords.home_id, filter.homeId) : undefined,
				filter.profileId ? eq(clockRecords.profile_id, filter.profileId) : undefined,
				filter.from
					? filter.overlap
						? or(isNull(clockRecords.clock_out_at), gt(clockRecords.clock_out_at, filter.from))
						: gte(clockRecords.clock_in_at, filter.from)
					: undefined,
				filter.to ? lte(clockRecords.clock_in_at, filter.to) : undefined
			)
		)
		.orderBy(desc(clockRecords.clock_in_at));
	return filter.limit ? query.limit(filter.limit) : query;
}
export async function overlappingClock(
	tx: Tx,
	agencyId: string,
	profileId: string,
	from: Date,
	to: Date
) {
	return (
		await tx
			.select({ id: clockRecords.id })
			.from(clockRecords)
			.where(
				and(
					eq(clockRecords.agency_id, agencyId),
					eq(clockRecords.profile_id, profileId),
					lt(clockRecords.clock_in_at, to),
					or(isNull(clockRecords.clock_out_at), gt(clockRecords.clock_out_at, from))
				)
			)
	)[0];
}
export function missedClocks(tx: Tx) {
	return tx
		.select({
			id: clockRecords.id,
			agencyId: clockRecords.agency_id,
			profileId: clockRecords.profile_id,
			homeId: clockRecords.home_id
		})
		.from(clockRecords)
		.where(
			and(
				isNull(clockRecords.clock_out_at),
				lt(clockRecords.clock_in_at, new Date(Date.now() - 9 * 3600000))
			)
		)
		.limit(500);
}
export async function hasClockAlert(tx: Tx, agencyId: string, id: string) {
	return (
		await tx
			.select({ id: notifications.id })
			.from(notifications)
			.where(
				and(
					eq(notifications.agency_id, agencyId),
					eq(notifications.reference_id, id),
					eq(notifications.type, 'clock_missed')
				)
			)
	)[0];
}
