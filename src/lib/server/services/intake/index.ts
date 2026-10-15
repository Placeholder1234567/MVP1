import type { Tx } from '../../db';
import { ServiceError } from '../../errors';
import { notifyHomeSupervisors } from '../notification/index.ts';
import * as q from './intake.queries';
export { listReferrals, listRooms } from './intake.queries';

export async function getReferral(tx: Tx, agencyId: string, id: string) {
	const row = await q.referral(tx, agencyId, id);
	if (!row) throw new ServiceError('NOT_FOUND', 'Referral not found');
	return row;
}
async function changed(tx: Tx, agencyId: string, row: Awaited<ReturnType<typeof getReferral>>) {
	await notifyHomeSupervisors(tx, agencyId, row.assigned_home_id, {
		type: 'referral_status_change',
		priority: 3,
		title: 'Referral status updated',
		referenceId: row.id,
		referenceType: 'referral'
	});
}
export function createReferral(
	tx: Tx,
	agencyId: string,
	profileId: string,
	input: {
		contactName?: string;
		contactPhone?: string;
		contactEmail?: string;
		clientName?: string;
		source?: string;
		notes?: string;
	}
) {
	return q.insertReferral(tx, {
		agency_id: agencyId,
		created_by: profileId,
		contact_name: input.contactName,
		contact_phone: input.contactPhone,
		contact_email: input.contactEmail,
		client_name: input.clientName,
		source: input.source,
		notes: input.notes
	});
}
export async function updateReferral(
	tx: Tx,
	agencyId: string,
	input: {
		id: string;
		status?: q.Referral['status'];
		assignedHomeId?: string;
		contactName?: string;
		contactPhone?: string;
		contactEmail?: string;
		notes?: string;
	}
) {
	const before = await getReferral(tx, agencyId, input.id);
	if (before.status === 'placed' || input.status === 'placed')
		throw new ServiceError(
			'RULE_VIOLATION',
			'Use admission to place an accepted referral; placed referrals cannot be reopened'
		);
	if (input.assignedHomeId && !(await q.home(tx, agencyId, input.assignedHomeId)))
		throw new ServiceError('NOT_FOUND', 'Home not found');
	const row = await q.saveReferral(tx, agencyId, input.id, {
		status: input.status,
		assigned_home_id: input.assignedHomeId,
		contact_name: input.contactName,
		contact_phone: input.contactPhone,
		contact_email: input.contactEmail,
		notes: input.notes
	});
	if (before.status !== row.status) await changed(tx, agencyId, row);
	return row;
}
export async function convertToClient(
	tx: Tx,
	agencyId: string,
	input: { referralId: string; homeId: string; name: string; firstName?: string; roomId?: string }
) {
	const referral = await getReferral(tx, agencyId, input.referralId);
	if (referral.status !== 'accepted')
		throw new ServiceError('RULE_VIOLATION', 'Only accepted referrals can be admitted');
	if (!(await q.home(tx, agencyId, input.homeId)))
		throw new ServiceError('NOT_FOUND', 'Home not found');
	if (input.roomId) {
		const room = await q.room(tx, agencyId, input.roomId);
		if (!room || room.home_id !== input.homeId)
			throw new ServiceError('NOT_FOUND', 'Room not found in this home');
		if (room.occupied_by || room.status !== 'available')
			throw new ServiceError('RULE_VIOLATION', 'Choose an available room');
	}
	const clientId = await q.admit(tx, agencyId, input.homeId, input.name, input.firstName);
	if (input.roomId)
		await q.saveRoom(tx, agencyId, input.roomId, { occupied_by: clientId, status: 'occupied' });
	const row = await q.saveReferral(tx, agencyId, referral.id, {
		status: 'placed',
		assigned_home_id: input.homeId
	});
	await changed(tx, agencyId, row);
	return { clientId, referralId: referral.id };
}
export async function updateRoom(
	tx: Tx,
	agencyId: string,
	input: {
		id: string;
		name?: string;
		capacity?: number;
		status?: q.Room['status'];
		occupiedBy?: string | null;
	}
) {
	const initial = await q.room(tx, agencyId, input.id);
	if (!initial || !(await q.home(tx, agencyId, initial.home_id)))
		throw new ServiceError('NOT_FOUND', 'Room not found');
	const row = (await q.room(tx, agencyId, input.id))!;
	if (input.name) await checkRoomName(tx, agencyId, row.home_id, input.name, row.id);
	const occupant = input.occupiedBy === undefined ? row.occupied_by : input.occupiedBy;
	if (occupant) {
		const person = await q.client(tx, agencyId, occupant);
		if (!person || !person.active || person.home_id !== row.home_id)
			throw new ServiceError('RULE_VIOLATION', 'Choose an active client assigned to this home');
		if (row.occupied_by && row.occupied_by !== occupant)
			throw new ServiceError(
				'RULE_VIOLATION',
				'Release the current occupant before assigning another'
			);
		if (await q.otherRoom(tx, agencyId, occupant, row.id))
			throw new ServiceError('RULE_VIOLATION', 'Client already occupies another room');
		if (input.status && input.status !== 'occupied')
			throw new ServiceError(
				'RULE_VIOLATION',
				'Release the occupant before changing room availability'
			);
	} else if (input.status === 'occupied')
		throw new ServiceError('RULE_VIOLATION', 'An occupied room needs a client');
	return q.saveRoom(tx, agencyId, row.id, {
		name: input.name,
		capacity: input.capacity,
		occupied_by: occupant,
		status: occupant
			? 'occupied'
			: (input.status ?? (input.occupiedBy === null ? 'available' : row.status))
	});
}

// Hold the home lock before checking names or changing inventory. This also
// serializes creation with admission and existing-client room assignment.
async function checkRoomName(
	tx: Tx,
	agencyId: string,
	homeId: string,
	name: string,
	exceptId?: string
) {
	const inventory = await q.listRooms(tx, agencyId, { homeId });
	if (
		inventory.some(
			(r) => r.id !== exceptId && r.name.trim().toLowerCase() === name.trim().toLowerCase()
		)
	)
		throw new ServiceError('RULE_VIOLATION', 'Choose a different room name within this home');
}

export async function createRoom(
	tx: Tx,
	agencyId: string,
	input: { homeId: string; name: string; capacity: number; status: 'available' | 'reserved' }
) {
	if (!(await q.home(tx, agencyId, input.homeId)))
		throw new ServiceError('NOT_FOUND', 'Home not found');
	await checkRoomName(tx, agencyId, input.homeId, input.name);
	return q.insertRoom(tx, {
		agency_id: agencyId,
		home_id: input.homeId,
		name: input.name,
		capacity: input.capacity,
		status: input.status
	});
}
