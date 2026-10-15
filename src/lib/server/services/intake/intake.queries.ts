import { and, desc, eq, ne } from 'drizzle-orm';
import type { Tx } from '../../db';
import { clients, clientHealthInfo, homes, referrals, rooms } from '../../db/schema';

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
export async function admit(
	tx: Tx,
	agencyId: string,
	homeId: string,
	name: string,
	firstName?: string
) {
	const [person] = await tx
		.insert(clients)
		.values({ agency_id: agencyId, home_id: homeId, name, first_name: firstName })
		.returning();
	await tx
		.insert(clientHealthInfo)
		.values({ agency_id: agencyId, home_id: homeId, client_id: person.id });
	return person.id;
}
