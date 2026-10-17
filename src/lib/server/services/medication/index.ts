// Medication Service (services.md): MAR records. Every record is permanent
// (constitution principle 13); corrections are new records with amendsId.
import { z } from 'zod';
export {
	NewMedication,
	MedicationChanges,
	MedicationId,
	MedicationHistoryFilter,
	createMedication,
	updateMedication,
	stopMedication,
	medicationHistory
} from './management';
import { addDays, hhmm, localTime, medTimes } from '../../../domain/index.ts';
import { doseNeedsReason } from '../../../domain/clinical.ts';
import { asService, type Tx } from '../../db';
import { pgConstraint, pgCode, ServiceError } from '../../errors';
import type { CurrentUser } from '../auth/index.ts';
import { notifyHomeSupervisors } from '../notification/index.ts';
import {
	findMarRecord,
	findMedication,
	findSlotOriginal,
	insertMarRecord,
	findDoseForEffect,
	selectMar,
	selectMedications,
	setMarFields
} from './medication.queries';

export const NewDose = z.object({
	id: z.uuid(),
	clientId: z.uuid(),
	medicationId: z.uuid(),
	day: z.iso.date(),
	/** The dose slot (one of the medication's scheduled times); absent for PRN doses */
	scheduledTime: z
		.string()
		.regex(/^\d{2}:\d{2}(:\d{2})?$/)
		.nullish(),
	status: z.enum(['given', 'refused', 'held']),
	reason: z.string().trim().max(500).nullish(),
	effect: z.string().trim().max(500).nullish(),
	recordedAt: z.coerce.date().optional(),
	/** Correction of an earlier record (the original is never changed) */
	amendsId: z.uuid().nullish()
});

export type DoseResult =
	| { result: 'recorded' }
	| { result: 'already-recorded' } // retried upload with the same ID
	| { result: 'conflict'; conflictWith: string; otherName: string | null };

const SLOT_INDEX = 'mar_records_client_med_day_slot_idx';

/**
 * Records a dose. If another record already answers the same scheduled slot
 * (two devices recorded it offline), the new record is still saved, marked
 * conflict_with the first, and the home's supervisors are alerted: two
 * records may mean the person got the dose twice (offline-sync.md §5).
 */
export async function recordDose(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	input: z.input<typeof NewDose>
): Promise<DoseResult> {
	const dose = NewDose.parse(input);
	if (user.role === 'caregiver' && !user.medCertified) {
		throw new ServiceError('FORBIDDEN', 'Only med-certified staff can record medications');
	}
	const today = localTime(new Date(), user.timeZone).day;
	if (dose.day > today || dose.day < addDays(today, -30)) {
		throw new ServiceError('VALIDATION_FAILED', 'Doses can only be recorded for the last 30 days');
	}
	if (dose.recordedAt && dose.recordedAt.getTime() > Date.now() + 5 * 60_000) {
		throw new ServiceError('VALIDATION_FAILED', 'The dose time is in the future');
	}
	const med = await findMedication(tx, agencyId, dose.clientId, dose.medicationId);
	if (!med) throw new ServiceError('NOT_FOUND', 'That medication is not on this person’s list');

	const times = medTimes(med);
	const isPrn = times.length === 0;
	const slot = dose.scheduledTime ? hhmm(dose.scheduledTime) : null;
	if (isPrn && slot)
		throw new ServiceError('VALIDATION_FAILED', 'As-needed doses have no time slot');
	if (!isPrn && (!slot || !times.includes(slot))) {
		throw new ServiceError('VALIDATION_FAILED', 'Pick one of this medication’s scheduled times');
	}
	if (doseNeedsReason(dose.status, isPrn, !!dose.amendsId) && !dose.reason) {
		throw new ServiceError(
			'VALIDATION_FAILED',
			dose.amendsId
				? 'Explain the correction'
				: dose.status !== 'given'
					? 'Say why the dose was refused or held'
					: 'Say why the as-needed dose was given'
		);
	}
	if (dose.amendsId) {
		// The query keeps its agency filter and the caller's RLS visibility.
		// A visible record for a different person is still not a valid audit link.
		const original = await findMarRecord(tx, agencyId, dose.amendsId);
		if (!original) throw new ServiceError('NOT_FOUND', 'The record being corrected was not found');
		// Match PostgreSQL UUID equality for callers using uppercase UUID text.
		if (original.clientId.toLowerCase() !== dose.clientId.toLowerCase())
			throw new ServiceError(
				'VALIDATION_FAILED',
				'A correction must refer to this person’s record'
			);
	}

	const row = {
		id: dose.id,
		agency_id: agencyId,
		client_id: dose.clientId,
		medication_id: dose.medicationId,
		day: dose.day,
		scheduled_time: slot,
		status: dose.status,
		reason: dose.reason ?? null,
		effect: dose.effect ?? null,
		is_prn: isPrn,
		recorded_at: dose.recordedAt ?? new Date(),
		recorded_by: user.profileId,
		recorded_by_name: user.name,
		created_by: user.profileId,
		amends_id: dose.amendsId ?? null
	};

	try {
		// Savepoint, so a duplicate slot doesn't abort the caller's transaction.
		const inserted = await tx.transaction((sp) => insertMarRecord(sp, row));
		return { result: inserted ? 'recorded' : 'already-recorded' };
	} catch (e) {
		if (pgCode(e) !== '23505' || pgConstraint(e) !== SLOT_INDEX) throw e;
	}

	const original = await findSlotOriginal(tx, agencyId, {
		clientId: dose.clientId,
		medicationId: dose.medicationId,
		day: dose.day,
		time: slot!
	});
	if (!original) throw new ServiceError('RULE_VIOLATION', 'This dose slot is already recorded');
	await insertMarRecord(tx, { ...row, conflict_with: original.id });
	await notifyHomeSupervisors(tx, agencyId, med.homeId, {
		type: 'med_possible_double_dose',
		priority: 1,
		// PHI-free: details are shown in the app after sign-in (notifications.md §1).
		title: 'A dose may have been recorded twice',
		referenceId: dose.id,
		referenceType: 'mar_records'
	});
	return { result: 'conflict', conflictWith: original.id, otherName: original.recordedByName };
}

/**
 * Records the observed effect of an as-needed dose, once (mar.recordEffect).
 * Caregivers can't update MAR rows under RLS, so after checking the dose is
 * visible to the caller (their homes), the update runs as app_service; the
 * mar_records_immutable trigger still allows only the effect column, once.
 */
export async function recordEffect(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	id: string,
	effect: string
): Promise<{ updatedAt: Date | null }> {
	const text = z.string().trim().min(1, 'Describe the effect').max(500).parse(effect);
	const dose = await findDoseForEffect(tx, agencyId, id);
	if (!dose) throw new ServiceError('NOT_FOUND', 'Dose not found');
	if (!dose.isPrn)
		throw new ServiceError('RULE_VIOLATION', 'Effects are recorded for as-needed doses only');
	if (dose.status !== 'given') throw new ServiceError('RULE_VIOLATION', 'This dose was not given');
	if (dose.effect) throw new ServiceError('RULE_VIOLATION', 'The effect was already recorded');
	if (user.role === 'caregiver' && !user.medCertified) {
		throw new ServiceError('FORBIDDEN', 'Only med-certified staff can record medications');
	}
	const updatedAt = await asService(tx, (t) => setMarFields(t, agencyId, id, { effect: text }));
	return { updatedAt };
}

/** Supervisor sign-off on a dose, especially refused or held ones (mar.acknowledge). */
export async function acknowledgeDose(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	id: string
): Promise<{ updatedAt: Date | null }> {
	if (user.role === 'caregiver')
		throw new ServiceError('FORBIDDEN', 'Only supervisors can acknowledge doses');
	const updatedAt = await setMarFields(tx, agencyId, id, { acknowledged: true });
	if (!updatedAt) throw new ServiceError('NOT_FOUND', 'Dose not found');
	return { updatedAt };
}

/** A person's MAR for a day or range, with medication details (mar.list). Defaults to today. */
export function listMar(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	clientId: string,
	range?: { from: string; to: string }
) {
	const today = localTime(new Date(), user.timeZone).day;
	return selectMar(tx, agencyId, clientId, range ?? { from: today, to: today });
}

/** A person's medications; stopped ones only when asked (medication.list). */
export async function listMedications(
	tx: Tx,
	agencyId: string,
	clientId: string,
	includeStopped = false
) {
	const rows = await selectMedications(tx, agencyId, clientId, includeStopped);
	if (rows.length > 500)
		throw new ServiceError('VALIDATION_FAILED', 'Too many medications for this person');
	return rows;
}
