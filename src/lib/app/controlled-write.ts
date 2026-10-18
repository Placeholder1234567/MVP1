import type { CareSession } from './session.svelte';
import { expectedOnHand, isDiscrepancy, type CountKind } from '#lib/domain/index.ts';

/** The count book for one medication, and what should be on hand now. */
export function medicationLedger(app: CareSession, medicationId: string) {
	const med = app.medications.find((m) => m.id === medicationId);
	const entries = app.controlledCounts.filter((c) => c.medication_id === medicationId);
	const doses = app.doses.filter((d) => d.medication_id === medicationId);
	const { expected, lastCount } = expectedOnHand(
		entries.map((e) => ({ kind: e.kind, quantity: e.quantity, recorded_at: e.recorded_at })),
		doses.map((d) => ({
			id: d.id,
			status: d.status,
			recorded_at: d.recorded_at,
			amends_id: d.amends_id,
			conflict_with: d.conflict_with
		})),
		Number(med?.units_per_dose) || 1
	);
	return { entries, expected, lastCount };
}

/**
 * Adds a count book entry to the encrypted on-device database. It uploads
 * through sync.upload, where the server sets who recorded it, checks the
 * witness and works out the expected count again. Returns the new ID.
 */
export async function insertCountEntry(
	app: CareSession,
	medicationId: string,
	e: { kind: CountKind; quantity: number; reason: string | null; witnessId: string | null }
): Promise<{ id: string; discrepancy: boolean; expected: number | null }> {
	const med = app.medications.find((m) => m.id === medicationId);
	if (!app.db || app.privacyLocked || !med?.home_id || !Number(med.controlled))
		throw new Error('Record unavailable');
	const expected = e.kind === 'count' ? medicationLedger(app, medicationId).expected : null;
	const discrepancy = expected !== null && isDiscrepancy(e.quantity, expected);
	const witness = e.witnessId ? app.staff.find((s) => s.id === e.witnessId) : undefined;
	const now = new Date().toISOString();
	const row = {
		id: crypto.randomUUID(),
		agency_id: app.user.agencyId,
		home_id: med.home_id,
		client_id: med.client_id,
		medication_id: medicationId,
		kind: e.kind,
		quantity: e.quantity,
		expected,
		discrepancy: discrepancy ? 1 : 0,
		reason: e.reason,
		recorded_by: app.user.profileId,
		recorded_by_name: app.user.name,
		witness_id: witness?.id ?? null,
		witness_name: witness?.name ?? null,
		witness_status: witness ? 'pending' : 'none',
		recorded_at: now,
		created_at: now,
		updated_at: now
	};
	const columns = Object.keys(row);
	// Local SQLite (PowerSync). Column names come from this module, never from input.
	await app.db.execute(
		`INSERT INTO controlled_counts (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
		Object.values(row)
	);
	await app.refreshUploadStatus();
	return { id: row.id, discrepancy, expected };
}
