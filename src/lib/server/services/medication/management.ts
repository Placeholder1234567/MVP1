import { z } from 'zod';
import type { Tx } from '../../db';
import { ServiceError } from '../../errors';
import type { CurrentUser } from '../auth/index.ts';
import { hhmm } from '../../../domain/time.ts';
import {
	appendMedicationHistory,
	insertManagedMedication,
	lockedMedicationClient,
	managementHistory,
	managementMedication,
	updateManagedMedication
} from './management.queries';

const text = (max: number) => z.string().trim().max(max).nullish();
const definition = {
	name: z.string().trim().min(1).max(200),
	dose: text(200),
	route: text(100),
	scheduledTimes: z
		.array(z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/))
		.max(24)
		.transform((times) => [...new Set(times)].sort()),
	prnInstructions: text(2000),
	notes: text(4000)
};
export const NewMedication = z.strictObject({
	clientId: z.uuid(),
	...definition,
	scheduledTimes: definition.scheduledTimes.optional(),
	startedAt: z
		.union([z.date(), z.iso.datetime({ offset: true })])
		.transform((v) => new Date(v))
		.optional()
});
export const MedicationChanges = z
	.strictObject({
		id: z.uuid(),
		name: definition.name.optional(),
		dose: definition.dose,
		route: definition.route,
		scheduledTimes: definition.scheduledTimes.optional(),
		prnInstructions: definition.prnInstructions,
		notes: definition.notes
	})
	.refine(
		(v) => Object.entries(v).some(([key, value]) => key !== 'id' && value !== undefined),
		'Provide a medication change'
	);
export const MedicationId = z.strictObject({ id: z.uuid() });
export const MedicationHistoryFilter = z.strictObject({ medicationId: z.uuid() });

function allowed(user: CurrentUser, agencyId: string) {
	if (user.agencyId !== agencyId || user.role === 'caregiver' || !user.features.includes('mar'))
		throw new ServiceError(
			'FORBIDDEN',
			'Medication management is unavailable for your role or agency plan'
		);
}
function validateOrder(times: readonly string[], instructions: string | null | undefined) {
	if (!times.length && !instructions?.trim())
		throw new ServiceError('VALIDATION_FAILED', 'As-needed medications need instructions');
	if (times.length && instructions?.trim())
		throw new ServiceError('VALIDATION_FAILED', 'Choose scheduled times or as-needed instructions');
}
type Medication = NonNullable<Awaited<ReturnType<typeof managementMedication>>>;
function present(row: Medication) {
	return {
		id: row.id,
		clientId: row.client_id,
		name: row.name,
		dose: row.dose,
		route: row.route,
		scheduledTimes: (row.scheduled_times ?? []).map(hhmm),
		prnInstructions: row.prn_instructions,
		notes: row.notes,
		startedAt: row.started_at,
		stoppedAt: row.stopped_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	};
}
export async function createMedication(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	input: z.input<typeof NewMedication>
) {
	allowed(user, agencyId);
	const p = NewMedication.parse(input);
	if (p.startedAt && p.startedAt.getTime() > Date.now())
		throw new ServiceError('VALIDATION_FAILED', 'Medication start time cannot be in the future');
	const times = p.scheduledTimes ?? [];
	validateOrder(times, p.prnInstructions);
	const client = await lockedMedicationClient(tx, agencyId, p.clientId);
	if (!client?.active || !client.homeId)
		throw new ServiceError('NOT_FOUND', 'Active person with a home not found');
	const row = await insertManagedMedication(tx, {
		agency_id: agencyId,
		client_id: client.id,
		home_id: client.homeId,
		name: p.name,
		dose: p.dose || null,
		route: p.route || null,
		scheduled_times: times,
		prn_instructions: p.prnInstructions || null,
		notes: p.notes || null,
		started_at: p.startedAt ?? new Date()
	});
	await appendMedicationHistory(tx, agencyId, row.id, user.profileId, 'added');
	return present(row);
}
export async function updateMedication(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	input: z.input<typeof MedicationChanges>
) {
	allowed(user, agencyId);
	const p = MedicationChanges.parse(input);
	const row = await managementMedication(tx, agencyId, p.id, true);
	if (!row) throw new ServiceError('NOT_FOUND', 'Medication not found');
	if (row.stopped_at)
		throw new ServiceError('RULE_VIOLATION', 'Stopped medications cannot be changed');
	validateOrder(
		p.scheduledTimes ?? row.scheduled_times ?? [],
		p.prnInstructions === undefined ? row.prn_instructions : p.prnInstructions
	);
	const updated = await updateManagedMedication(tx, agencyId, row.id, {
		...(p.name !== undefined ? { name: p.name } : {}),
		...(p.dose !== undefined ? { dose: p.dose || null } : {}),
		...(p.route !== undefined ? { route: p.route || null } : {}),
		...(p.scheduledTimes !== undefined ? { scheduled_times: p.scheduledTimes } : {}),
		...(p.prnInstructions !== undefined ? { prn_instructions: p.prnInstructions || null } : {}),
		...(p.notes !== undefined ? { notes: p.notes || null } : {})
	});
	await appendMedicationHistory(tx, agencyId, row.id, user.profileId, 'updated');
	return present(updated);
}
export async function stopMedication(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	input: z.input<typeof MedicationId>
) {
	allowed(user, agencyId);
	const p = MedicationId.parse(input);
	const row = await managementMedication(tx, agencyId, p.id, true);
	if (!row) throw new ServiceError('NOT_FOUND', 'Medication not found');
	if (row.stopped_at) return present(row);
	const stopped = await updateManagedMedication(tx, agencyId, row.id, { stopped_at: new Date() });
	await appendMedicationHistory(tx, agencyId, row.id, user.profileId, 'stopped');
	return present(stopped);
}
export async function medicationHistory(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	input: z.input<typeof MedicationHistoryFilter>
) {
	allowed(user, agencyId);
	const p = MedicationHistoryFilter.parse(input);
	if (!(await managementMedication(tx, agencyId, p.medicationId)))
		throw new ServiceError('NOT_FOUND', 'Medication not found');
	const rows = await managementHistory(tx, agencyId, p.medicationId);
	if (rows.length > 500)
		throw new ServiceError('VALIDATION_FAILED', 'Medication history is too large');
	return rows;
}
