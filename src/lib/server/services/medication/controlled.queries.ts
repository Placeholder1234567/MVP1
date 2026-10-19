import { and, eq, inArray, lt } from 'drizzle-orm';
import type { Tx } from '../../db';
import { agencies, controlledCounts, marRecords, medications, profiles } from '../../db/schema';

export async function controlledMedication(tx: Tx, agencyId: string, id: string) {
	const [row] = await tx
		.select({
			id: medications.id,
			clientId: medications.client_id,
			homeId: medications.home_id,
			controlled: medications.controlled,
			unitsPerDose: medications.units_per_dose
		})
		.from(medications)
		.where(and(eq(medications.agency_id, agencyId), eq(medications.id, id)))
		.limit(1);
	return row;
}

export async function agencySettings(tx: Tx, agencyId: string) {
	const [row] = await tx
		.select({ settings: agencies.settings })
		.from(agencies)
		.where(eq(agencies.id, agencyId));
	return row?.settings ?? {};
}

export async function witnessProfile(tx: Tx, agencyId: string, id: string) {
	const [row] = await tx
		.select({
			id: profiles.id,
			name: profiles.name,
			role: profiles.role,
			active: profiles.active,
			med_certified: profiles.med_certified,
			homeIds: profiles.home_ids,
			authUid: profiles.auth_uid,
			mfaEnabled: profiles.mfa_enabled
		})
		.from(profiles)
		.where(and(eq(profiles.agency_id, agencyId), eq(profiles.id, id)))
		.limit(1);
	return row;
}

/** Count book entries and doses for one medication before a moment, for the expected count. */
export async function ledgerBefore(tx: Tx, agencyId: string, medicationId: string, before: Date) {
	const [entries, doses] = await Promise.all([
		tx
			.select({
				kind: controlledCounts.kind,
				quantity: controlledCounts.quantity,
				recordedAt: controlledCounts.recorded_at
			})
			.from(controlledCounts)
			.where(
				and(
					eq(controlledCounts.agency_id, agencyId),
					eq(controlledCounts.medication_id, medicationId),
					lt(controlledCounts.recorded_at, before)
				)
			),
		tx
			.select({
				id: marRecords.id,
				status: marRecords.status,
				recordedAt: marRecords.recorded_at,
				amendsId: marRecords.amends_id,
				conflictWith: marRecords.conflict_with
			})
			.from(marRecords)
			.where(
				and(
					eq(marRecords.agency_id, agencyId),
					eq(marRecords.medication_id, medicationId),
					lt(marRecords.recorded_at, before)
				)
			)
	]);
	return { entries, doses };
}

export async function insertCountEntry(tx: Tx, row: typeof controlledCounts.$inferInsert) {
	const [inserted] = await tx
		.insert(controlledCounts)
		.values(row)
		.onConflictDoNothing({ target: controlledCounts.id })
		.returning({ id: controlledCounts.id });
	return inserted ?? null;
}

export async function countersignEntry(tx: Tx, agencyId: string, id: string, witnessId: string) {
	const [row] = await tx
		.update(controlledCounts)
		.set({ witness_status: 'verified', witnessed_at: new Date(), updated_at: new Date() })
		.where(
			and(
				eq(controlledCounts.agency_id, agencyId),
				eq(controlledCounts.id, id),
				eq(controlledCounts.witness_id, witnessId),
				inArray(controlledCounts.witness_status, ['pending'])
			)
		)
		.returning({ id: controlledCounts.id, witnessedAt: controlledCounts.witnessed_at });
	return row ?? null;
}

/** True if this witness sign-in (its token's hash) already witnessed an entry. */
export async function witnessSignInUsed(tx: Tx, hash: string) {
	const [row] = await tx
		.select({ id: controlledCounts.id })
		.from(controlledCounts)
		.where(eq(controlledCounts.witness_sign_in, hash))
		.limit(1);
	return Boolean(row);
}

/** Marks an entry witnessed in person; the caller has verified the witness's sign-in. */
export async function markWitnessedInPerson(tx: Tx, agencyId: string, id: string, signIn: string) {
	await tx
		.update(controlledCounts)
		.set({
			witness_status: 'verified',
			witnessed_at: new Date(),
			witness_sign_in: signIn,
			updated_at: new Date()
		})
		.where(
			and(
				eq(controlledCounts.agency_id, agencyId),
				eq(controlledCounts.id, id),
				eq(controlledCounts.witness_status, 'pending')
			)
		);
}
