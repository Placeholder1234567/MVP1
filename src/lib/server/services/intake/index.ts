import type { Tx } from '../../db';
import { ServiceError } from '../../errors';
import { createClient } from '../client/index.ts';
import { requireOpenHome } from '../home/index.ts';
import { notifyHomeSupervisors } from '../notification/index.ts';
import * as q from './intake.queries';
import { matchPlacement, placementNeeds, type PlacementNeeds } from '#lib/domain/placement.ts';
import { stageMove } from '#lib/domain/referral-stage.ts';
export { listReferrals, listRooms } from './intake.queries';

async function requireReferral(tx: Tx, agencyId: string, id: string) {
	const row = await q.referral(tx, agencyId, id);
	if (!row) throw new ServiceError('NOT_FOUND', 'Referral not found');
	return row;
}
async function matchToHome(tx: Tx, agencyId: string, needs: PlacementNeeds, viewerId: string) {
	const { facts, complete } = await q.placementFacts(tx, agencyId, viewerId);
	return { complete, homes: matchPlacement(needs, facts, complete) };
}
export async function getReferral(tx: Tx, agencyId: string, id: string, viewerId: string) {
	const row = await requireReferral(tx, agencyId, id);
	return {
		...row,
		placement: await matchToHome(tx, agencyId, placementNeeds(row.placement_needs), viewerId)
	};
}
async function changed(tx: Tx, agencyId: string, row: Awaited<ReturnType<typeof requireReferral>>) {
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
		placementNeeds?: PlacementNeeds;
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
		notes: input.notes,
		placement_needs: input.placementNeeds
	});
}
type Author = { profileId: string; name: string };

/**
 * Adds a note at the referral's current stage (US-29): a tour, a call, why
 * it was declined. Notes are append-only.
 */
export async function addReferralNote(
	tx: Tx,
	agencyId: string,
	author: Author,
	input: { referralId: string; body: string }
) {
	const row = await requireReferral(tx, agencyId, input.referralId);
	return q.insertReferralNote(tx, {
		agency_id: agencyId,
		referral_id: row.id,
		status: row.status,
		body: input.body,
		author_id: author.profileId,
		author_name: author.name,
		created_by: author.profileId
	});
}

/** A referral's notes at each stage, oldest first. */
export async function listReferralNotes(tx: Tx, agencyId: string, referralId: string) {
	await requireReferral(tx, agencyId, referralId);
	return q.referralNoteRows(tx, agencyId, referralId);
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
		placementNeeds?: PlacementNeeds;
		/** Why a referral moves back a stage or is reopened; kept as a stage note. */
		reason?: string;
	},
	author: Author
) {
	const before = await requireReferral(tx, agencyId, input.id);
	const move = stageMove(before.status, input.status ?? before.status);
	if (!move.ok || before.status === 'placed' || input.status === 'placed')
		throw new ServiceError(
			'RULE_VIOLATION',
			'Use admission to place an accepted referral; placed referrals cannot be reopened'
		);
	const reason = input.reason?.trim();
	if (move.needsReason && !reason)
		throw new ServiceError(
			'VALIDATION_FAILED',
			'Say why this referral is moving back a stage or being reopened'
		);
	if (input.assignedHomeId) requireOpenHome(await q.home(tx, agencyId, input.assignedHomeId));
	const row = await q.saveReferral(tx, agencyId, input.id, {
		status: input.status,
		assigned_home_id: input.assignedHomeId,
		contact_name: input.contactName,
		contact_phone: input.contactPhone,
		contact_email: input.contactEmail,
		notes: input.notes,
		placement_needs: input.placementNeeds
	});
	if (move.needsReason && reason)
		await q.insertReferralNote(tx, {
			agency_id: agencyId,
			referral_id: row.id,
			status: row.status,
			body: `Moved from ${before.status}: ${reason}`,
			author_id: author.profileId,
			author_name: author.name,
			created_by: author.profileId
		});
	if (before.status !== row.status) await changed(tx, agencyId, row);
	return getReferral(tx, agencyId, row.id, author.profileId);
}
export async function convertToClient(
	tx: Tx,
	agencyId: string,
	input: { referralId: string; homeId: string; name: string; firstName?: string; roomId?: string },
	viewerId: string
) {
	const referral = await requireReferral(tx, agencyId, input.referralId);
	if (referral.status !== 'accepted')
		throw new ServiceError('RULE_VIOLATION', 'Only accepted referrals can be admitted');
	requireOpenHome(await q.home(tx, agencyId, input.homeId));
	if (input.roomId) {
		const room = await q.room(tx, agencyId, input.roomId);
		if (!room || room.home_id !== input.homeId)
			throw new ServiceError('NOT_FOUND', 'Room not found in this home');
		if (room.occupied_by || room.status !== 'available')
			throw new ServiceError('RULE_VIOLATION', 'Choose an available room');
	}
	// Re-read current facts after home/room validation. Guidance never selects or admits automatically.
	const placement = await matchToHome(
		tx,
		agencyId,
		placementNeeds(referral.placement_needs),
		viewerId
	);
	// Through the Client Service, like any new person (initials, first name, health row).
	const { id: clientId } = await createClient(tx, agencyId, {
		homeId: input.homeId,
		name: input.name,
		firstName: input.firstName
	});
	if (input.roomId)
		await q.saveRoom(tx, agencyId, input.roomId, { occupied_by: clientId, status: 'occupied' });
	const row = await q.saveReferral(tx, agencyId, referral.id, {
		status: 'placed',
		assigned_home_id: input.homeId
	});
	await changed(tx, agencyId, row);
	return { clientId, referralId: referral.id, placement };
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
	if (!initial) throw new ServiceError('NOT_FOUND', 'Room not found');
	requireOpenHome(await q.home(tx, agencyId, initial.home_id), 'Room not found');
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
	requireOpenHome(await q.home(tx, agencyId, input.homeId));
	await checkRoomName(tx, agencyId, input.homeId, input.name);
	return q.insertRoom(tx, {
		agency_id: agencyId,
		home_id: input.homeId,
		name: input.name,
		capacity: input.capacity,
		status: input.status
	});
}
