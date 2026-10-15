import { and, eq, gte, lte, ne } from 'drizzle-orm';
import type { Tx } from '../../db';
import { homes, profiles, scheduleSlots } from '../../db/schema';

export async function scheduleHome(tx: Tx, agencyId: string, id: string) {
	return (
		await tx
			.select()
			.from(homes)
			.where(and(eq(homes.agency_id, agencyId), eq(homes.id, id)))
	)[0];
}
export async function scheduleStaff(tx: Tx, agencyId: string, id: string) {
	return (
		await tx
			.select()
			.from(profiles)
			.where(and(eq(profiles.agency_id, agencyId), eq(profiles.id, id)))
			.for('update')
	)[0];
}
export function weekSlots(tx: Tx, agencyId: string, homeId: string, from: string, to: string) {
	return tx
		.select()
		.from(scheduleSlots)
		.where(
			and(
				eq(scheduleSlots.agency_id, agencyId),
				eq(scheduleSlots.home_id, homeId),
				gte(scheduleSlots.day, from),
				lte(scheduleSlots.day, to)
			)
		)
		.orderBy(scheduleSlots.day, scheduleSlots.shift);
}
export function staffShifts(tx: Tx, agencyId: string, profileId: string, from: string, to: string) {
	return tx
		.select()
		.from(scheduleSlots)
		.where(
			and(
				eq(scheduleSlots.agency_id, agencyId),
				eq(scheduleSlots.assigned_to, profileId),
				gte(scheduleSlots.day, from),
				lte(scheduleSlots.day, to)
			)
		)
		.orderBy(scheduleSlots.day);
}
export async function conflictingSlot(
	tx: Tx,
	agencyId: string,
	profileId: string,
	homeId: string,
	day: string,
	shift: 'am' | 'pm' | 'on'
) {
	return (
		await tx
			.select({ id: scheduleSlots.id })
			.from(scheduleSlots)
			.where(
				and(
					eq(scheduleSlots.agency_id, agencyId),
					eq(scheduleSlots.assigned_to, profileId),
					eq(scheduleSlots.day, day),
					eq(scheduleSlots.shift, shift),
					ne(scheduleSlots.home_id, homeId)
				)
			)
	)[0];
}
export async function saveSlot(
	tx: Tx,
	agencyId: string,
	input: { homeId: string; day: string; shift: 'am' | 'pm' | 'on'; profileId: string | null }
) {
	const row = {
		agency_id: agencyId,
		home_id: input.homeId,
		day: input.day,
		shift: input.shift,
		assigned_to: input.profileId,
		status: input.profileId ? ('filled' as const) : ('open' as const),
		via_lomi: false,
		updated_at: new Date()
	};
	return (
		await tx
			.insert(scheduleSlots)
			.values(row)
			.onConflictDoUpdate({
				target: [
					scheduleSlots.agency_id,
					scheduleSlots.day,
					scheduleSlots.shift,
					scheduleSlots.home_id
				],
				set: {
					assigned_to: row.assigned_to,
					status: row.status,
					via_lomi: false,
					updated_at: row.updated_at
				}
			})
			.returning()
	)[0];
}
