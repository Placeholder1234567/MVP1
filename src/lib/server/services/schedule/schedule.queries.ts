import { and, asc, eq, gte, lte, ne } from 'drizzle-orm';
import type { Tx } from '../../db';
import { homes, profiles, scheduleSlots, scheduleTemplates } from '../../db/schema';

export async function scheduleHome(tx: Tx, agencyId: string, id: string) {
	return (
		await tx
			.select()
			.from(homes)
			.where(and(eq(homes.agency_id, agencyId), eq(homes.id, id)))
	)[0];
}
/**
 * Locks the staff member for a scheduling decision. NO KEY UPDATE, not
 * UPDATE: rows that reference the profile (notifications, offer evidence)
 * take a KEY SHARE lock for their foreign key, and FOR UPDATE would block
 * them and deadlock with the jobs that insert them.
 */
export async function scheduleStaff(tx: Tx, agencyId: string, id: string) {
	return (
		await tx
			.select()
			.from(profiles)
			.where(and(eq(profiles.agency_id, agencyId), eq(profiles.id, id)))
			.for('no key update')
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

export function homeTemplates(tx: Tx, agencyId: string, homeId: string) {
	return tx
		.select({
			id: scheduleTemplates.id,
			name: scheduleTemplates.name,
			slots: scheduleTemplates.slots,
			updatedAt: scheduleTemplates.updated_at
		})
		.from(scheduleTemplates)
		.where(and(eq(scheduleTemplates.agency_id, agencyId), eq(scheduleTemplates.home_id, homeId)))
		.orderBy(asc(scheduleTemplates.name));
}
export async function templateById(tx: Tx, agencyId: string, id: string) {
	const [row] = await tx
		.select()
		.from(scheduleTemplates)
		.where(and(eq(scheduleTemplates.agency_id, agencyId), eq(scheduleTemplates.id, id)));
	return row;
}
/** Saves a template; a name already used at the home is replaced. */
export async function upsertTemplate(tx: Tx, row: typeof scheduleTemplates.$inferInsert) {
	const [saved] = await tx
		.insert(scheduleTemplates)
		.values(row)
		.onConflictDoUpdate({
			target: [scheduleTemplates.home_id, scheduleTemplates.name],
			set: { slots: row.slots, updated_at: new Date() }
		})
		.returning({ id: scheduleTemplates.id, name: scheduleTemplates.name });
	return saved;
}
export async function removeTemplate(tx: Tx, agencyId: string, id: string) {
	const deleted = await tx
		.delete(scheduleTemplates)
		.where(and(eq(scheduleTemplates.agency_id, agencyId), eq(scheduleTemplates.id, id)))
		.returning({ id: scheduleTemplates.id });
	return deleted.length > 0;
}
