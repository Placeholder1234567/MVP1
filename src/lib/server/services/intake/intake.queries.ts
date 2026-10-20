import { and, desc, eq, ne, isNull, inArray } from 'drizzle-orm';
import type { Tx } from '../../db';
import { clients, homes, profiles, referralNotes, referrals, rooms } from '../../db/schema';

/** Bounded, caller-RLS-scoped facts. No staffing schedule or clinical suitability inferred. */
export async function placementFacts(tx: Tx, agencyId: string) {
	const visibleHomes = await tx
		.select({ homeId: homes.id, homeName: homes.name })
		.from(homes)
		.where(and(eq(homes.agency_id, agencyId), isNull(homes.archived_at)))
		.orderBy(homes.name, homes.id)
		.limit(201);
	const selected = visibleHomes.slice(0, 200);
	if (!selected.length) return { facts: [], complete: true };
	const inventory = await tx
		.select({ homeId: rooms.home_id })
		.from(rooms)
		.where(
			and(
				eq(rooms.agency_id, agencyId),
				inArray(
					rooms.home_id,
					selected.map((h) => h.homeId)
				),
				eq(rooms.status, 'available'),
				isNull(rooms.occupied_by)
			)
		)
		.orderBy(rooms.id)
		.limit(10001);
	const staff = await tx
		.select({ homeIds: profiles.home_ids })
		.from(profiles)
		.where(
			and(
				eq(profiles.agency_id, agencyId),
				eq(profiles.role, 'caregiver'),
				eq(profiles.active, true),
				eq(profiles.med_certified, true)
			)
		)
		.orderBy(profiles.id)
		.limit(10001);
	return {
		complete: visibleHomes.length <= 200 && inventory.length <= 10000 && staff.length <= 10000,
		facts: selected.map((h) => ({
			...h,
			availableRooms: inventory.slice(0, 10000).filter((r) => r.homeId === h.homeId).length,
			certifiedCaregivers: staff.slice(0, 10000).filter((p) => p.homeIds?.includes(h.homeId)).length
		}))
	};
}

export type Referral = typeof referrals.$inferInsert;
export type Room = typeof rooms.$inferInsert;
export async function referral(tx: Tx, agencyId: string, id: string) {
	return (
		await tx
			.select()
			.from(referrals)
			.where(and(eq(referrals.agency_id, agencyId), eq(referrals.id, id)))
			.for('update')
	)[0];
}
export async function home(tx: Tx, agencyId: string, id: string) {
	// All room operations lock the home first, serializing occupancy changes within it.
	return (
		await tx
			.select()
			.from(homes)
			.where(and(eq(homes.agency_id, agencyId), eq(homes.id, id)))
			.for('update')
	)[0];
}
export async function room(tx: Tx, agencyId: string, id: string) {
	return (
		await tx
			.select()
			.from(rooms)
			.where(and(eq(rooms.agency_id, agencyId), eq(rooms.id, id)))
	)[0];
}
export async function client(tx: Tx, agencyId: string, id: string) {
	return (
		await tx
			.select()
			.from(clients)
			.where(and(eq(clients.agency_id, agencyId), eq(clients.id, id)))
			.for('update')
	)[0];
}
export function listReferrals(
	tx: Tx,
	agencyId: string,
	input: { status?: Referral['status']; limit: number; offset: number }
) {
	return tx
		.select({
			id: referrals.id,
			contactName: referrals.contact_name,
			clientName: referrals.client_name,
			source: referrals.source,
			status: referrals.status,
			assignedHomeName: homes.name,
			createdAt: referrals.created_at
		})
		.from(referrals)
		.leftJoin(homes, and(eq(homes.agency_id, agencyId), eq(homes.id, referrals.assigned_home_id)))
		.where(
			and(
				eq(referrals.agency_id, agencyId),
				input.status ? eq(referrals.status, input.status) : undefined
			)
		)
		.orderBy(desc(referrals.created_at), referrals.id)
		.limit(input.limit)
		.offset(input.offset);
}
export async function insertReferral(tx: Tx, data: Referral) {
	return (await tx.insert(referrals).values(data).returning())[0];
}
export async function saveReferral(tx: Tx, agencyId: string, id: string, data: Partial<Referral>) {
	return (
		await tx
			.update(referrals)
			.set({ ...data, updated_at: new Date() })
			.where(and(eq(referrals.agency_id, agencyId), eq(referrals.id, id)))
			.returning()
	)[0];
}
export function listRooms(
	tx: Tx,
	agencyId: string,
	input: { homeId?: string; status?: Room['status'] }
) {
	return tx
		.select({
			id: rooms.id,
			homeId: rooms.home_id,
			homeName: homes.name,
			name: rooms.name,
			capacity: rooms.capacity,
			occupiedBy: rooms.occupied_by,
			occupiedByName: clients.name,
			status: rooms.status
		})
		.from(rooms)
		.innerJoin(homes, and(eq(homes.agency_id, agencyId), eq(homes.id, rooms.home_id)))
		.leftJoin(clients, and(eq(clients.agency_id, agencyId), eq(clients.id, rooms.occupied_by)))
		.where(
			and(
				eq(rooms.agency_id, agencyId),
				input.homeId ? eq(rooms.home_id, input.homeId) : undefined,
				input.status ? eq(rooms.status, input.status) : undefined
			)
		)
		.orderBy(homes.name, rooms.name, rooms.id);
}
export async function otherRoom(tx: Tx, agencyId: string, clientId: string, roomId: string) {
	return (
		await tx
			.select({ id: rooms.id })
			.from(rooms)
			.where(
				and(eq(rooms.agency_id, agencyId), eq(rooms.occupied_by, clientId), ne(rooms.id, roomId))
			)
	)[0];
}
export async function saveRoom(tx: Tx, agencyId: string, id: string, data: Partial<Room>) {
	return (
		await tx
			.update(rooms)
			.set({ ...data, updated_at: new Date() })
			.where(and(eq(rooms.agency_id, agencyId), eq(rooms.id, id)))
			.returning()
	)[0];
}
export async function insertRoom(tx: Tx, data: Room) {
	return (await tx.insert(rooms).values(data).returning())[0];
}
export async function insertReferralNote(tx: Tx, row: typeof referralNotes.$inferInsert) {
	const [created] = await tx.insert(referralNotes).values(row).returning({
		id: referralNotes.id,
		status: referralNotes.status,
		body: referralNotes.body,
		authorName: referralNotes.author_name,
		createdAt: referralNotes.created_at
	});
	return created;
}
/** A referral's stage notes, oldest first. */
export function referralNoteRows(tx: Tx, agencyId: string, referralId: string) {
	return tx
		.select({
			id: referralNotes.id,
			status: referralNotes.status,
			body: referralNotes.body,
			authorName: referralNotes.author_name,
			createdAt: referralNotes.created_at
		})
		.from(referralNotes)
		.where(and(eq(referralNotes.agency_id, agencyId), eq(referralNotes.referral_id, referralId)))
		.orderBy(referralNotes.created_at, referralNotes.id);
}
