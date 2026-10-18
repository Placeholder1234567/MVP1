// Controlled medication count book (domain/controlled.ts): receipts, counts,
// waste and disposal. Entries are permanent; the named witness countersigns.
// The server works out the expected count itself, from the entries and MAR
// doses before this one, so an offline count uploaded late is still judged
// against what was true when it was made.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
	COUNT_KINDS,
	canWitness,
	countEntryError,
	expectedOnHand,
	isDiscrepancy,
	parseControlledRules,
	type StaffRole
} from '../../../domain/index.ts';
import { asService, type Tx } from '../../db';
import { mfaEnforced, verifyWitnessSignIn } from '../../identity';
import { ServiceError } from '../../errors';
import type { CurrentUser } from '../auth/index.ts';
import { controlledCountDiscrepancy, controlledCountersignRequest } from '../notification/index.ts';
import {
	agencySettings,
	controlledMedication,
	countersignEntry,
	insertCountEntry,
	ledgerBefore,
	markWitnessedInPerson,
	witnessSignInUsed,
	witnessProfile
} from './controlled.queries';

export const NewCountEntry = z.object({
	id: z.uuid(),
	medicationId: z.uuid(),
	kind: z.enum(COUNT_KINDS),
	quantity: z.coerce.number(),
	reason: z.string().trim().max(500).nullish(),
	witnessId: z.uuid().nullish(),
	/**
	 * The witness's ID token from signing in on this device just now. Online
	 * only; verified, used once and never stored.
	 */
	witnessToken: z.string().min(1).max(4096).nullish(),
	/** When it was counted, possibly offline */
	recordedAt: z.coerce.date().optional()
});

export async function recordCountEntry(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	input: z.input<typeof NewCountEntry>
): Promise<{
	created: boolean;
	expected: number | null;
	discrepancy: boolean;
	witnessed: boolean;
}> {
	const e = NewCountEntry.parse(input);
	if (user.role === 'caregiver' && !user.medCertified)
		throw new ServiceError(
			'FORBIDDEN',
			'Only med-certified staff can record controlled medications'
		);
	const now = Date.now();
	const recordedAt = e.recordedAt ?? new Date(now);
	if (recordedAt.getTime() > now + 5 * 60_000)
		throw new ServiceError('VALIDATION_FAILED', 'The time is in the future');
	if (recordedAt.getTime() < now - 30 * 86_400_000)
		throw new ServiceError(
			'VALIDATION_FAILED',
			'Entries can only be recorded for the last 30 days'
		);
	const med = await controlledMedication(tx, agencyId, e.medicationId);
	if (!med?.homeId) throw new ServiceError('NOT_FOUND', 'Medication not found');
	if (!med.controlled)
		throw new ServiceError('VALIDATION_FAILED', 'This medication is not marked as controlled');
	const rules = parseControlledRules(await agencySettings(tx, agencyId));
	const problem = countEntryError({
		kind: e.kind,
		quantity: e.quantity,
		reason: e.reason,
		needsWitness: rules.witness[e.kind],
		witnessId: e.witnessId
	});
	if (problem) throw new ServiceError('VALIDATION_FAILED', problem);

	let witness: Awaited<ReturnType<typeof witnessProfile>> | undefined;
	if (e.witnessId) {
		witness = await witnessProfile(tx, agencyId, e.witnessId);
		const inHome =
			witness && (witness.role !== 'caregiver' || (witness.homeIds ?? []).includes(med.homeId));
		if (!witness || !inHome || !canWitness(rules, witness, user.profileId))
			throw new ServiceError(
				'VALIDATION_FAILED',
				rules.witnessQualification === 'med_certified'
					? 'The witness must be someone else who is med-certified and works at this home'
					: 'The witness must be someone else who works at this home'
			);
	}

	// Signed in on this device: the account must be the named witness's, and
	// pass its second factor when it has one.
	let inPerson: string | null = null;
	if (e.witnessToken) {
		if (!witness) throw new ServiceError('VALIDATION_FAILED', 'Choose who witnessed this.');
		const signIn = await verifyWitnessSignIn(e.witnessToken);
		if (
			!signIn ||
			signIn.uid !== witness.authUid ||
			(mfaEnforced() && witness.mfaEnabled && !signIn.secondFactor)
		)
			throw new ServiceError(
				'VALIDATION_FAILED',
				'The witness sign-in could not be confirmed. Sign in again or have them confirm later.'
			);
		// One sign-in witnesses one entry: a reused token is refused.
		const hash = createHash('sha256').update(e.witnessToken).digest('hex');
		if (await asService(tx, (t) => witnessSignInUsed(t, hash)))
			throw new ServiceError(
				'VALIDATION_FAILED',
				'That witness sign-in was already used. The witness signs in again for each entry.'
			);
		inPerson = hash;
	}

	let expected: number | null = null;
	let discrepancy = false;
	if (e.kind === 'count') {
		const ledger = await ledgerBefore(tx, agencyId, med.id, recordedAt);
		expected = expectedOnHand(
			ledger.entries.map((x) => ({
				kind: x.kind,
				quantity: x.quantity,
				recorded_at: x.recordedAt.toISOString()
			})),
			ledger.doses.map((d) => ({
				id: d.id,
				status: d.status,
				recorded_at: d.recordedAt?.toISOString() ?? null,
				amends_id: d.amendsId,
				conflict_with: d.conflictWith
			})),
			med.unitsPerDose
		).expected;
		discrepancy = isDiscrepancy(e.quantity, expected);
	}

	const row = await insertCountEntry(tx, {
		id: e.id,
		agency_id: agencyId,
		home_id: med.homeId,
		client_id: med.clientId,
		medication_id: med.id,
		kind: e.kind,
		quantity: e.quantity,
		expected,
		discrepancy,
		reason: e.reason || null,
		recorded_by: user.profileId,
		recorded_by_name: user.name,
		witness_id: witness?.id ?? null,
		witness_name: witness?.name ?? null,
		witness_status: witness ? 'pending' : 'none',
		recorded_at: recordedAt
	});
	if (row) {
		// RLS lets staff add only pending witnesses; the verified sign-in is the server's call.
		if (inPerson) await asService(tx, (t) => markWitnessedInPerson(t, agencyId, row.id, inPerson!));
		if (discrepancy) await controlledCountDiscrepancy(tx, agencyId, med.homeId, row.id);
		if (witness && !inPerson)
			await controlledCountersignRequest(
				tx,
				agencyId,
				{ id: witness.id, role: witness.role as StaffRole },
				user.name,
				med.homeId,
				row.id
			);
	}
	return { created: !!row, expected, discrepancy, witnessed: !!inPerson && !!row };
}

export const Countersign = z.object({ id: z.uuid() });

/** The named witness confirms an entry from their own device. */
export async function countersign(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	input: z.input<typeof Countersign>
) {
	const { id } = Countersign.parse(input);
	const row = await countersignEntry(tx, agencyId, id, user.profileId);
	if (!row)
		throw new ServiceError('NOT_FOUND', 'Nothing is waiting for your countersignature here');
	return { id: row.id, witnessedAt: row.witnessedAt };
}
