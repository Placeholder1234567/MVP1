// Client Service (services.md §12; trpc-router.md `client.*`): the people an
// agency supports, their health profile and lifecycle. Clients are never
// deleted: archiving sets active = false. Every change is audited by the
// audit_row_change trigger, and a home change moves the client's synced
// records with them (clients_home_change trigger).
import { z } from 'zod';
import { CASE_NOTE_CATEGORIES, initialsOf } from '../../../domain/index.ts';
import type { FeatureFlag } from '../../../entitlements/tier-features.ts';
import type { Tx } from '../../db';
import { ServiceError } from '../../errors';
import { getHome } from '../home/index.ts';
import { listMedications } from '../medication/index.ts';
import {
	insertCaseNote,
	insertClient,
	selectActiveGoals,
	selectClient,
	selectCaseNotes,
	selectClients,
	selectHealthInfo,
	updateClientRow,
	upsertHealthInfo
} from './client.queries';

const text = (max: number) => z.string().trim().max(max);

export const ClientFilter = z.object({
	homeId: z.uuid().optional(),
	active: z.boolean().optional()
});

export const HealthFields = z.object({
	allergies: text(2000).nullable().optional(),
	conditions: text(2000).nullable().optional(),
	diet: text(2000).nullable().optional(),
	doctor: text(500).nullable().optional(),
	guardian: text(500).nullable().optional(),
	dob: z.iso.date().nullable().optional()
});

export const NewClient = z.object({
	name: text(100).min(1),
	firstName: text(50).optional(),
	homeId: z.uuid(),
	info: text(4000).optional(),
	/** Behaviors named in the support plan (frontend-spec-3.md §4.7) */
	behaviors: z.array(text(100).min(1)).max(30).optional(),
	healthInfo: HealthFields.optional()
});

export const ClientChanges = z.object({
	id: z.uuid(),
	name: text(100).min(1).optional(),
	firstName: text(50).nullable().optional(),
	homeId: z.uuid().optional(),
	info: text(4000).nullable().optional(),
	behaviors: z.array(text(100).min(1)).max(30).nullable().optional(),
	active: z.boolean().optional()
});

export const HealthChanges = HealthFields.extend({ clientId: z.uuid() });

export function listClients(tx: Tx, agencyId: string, filter: z.infer<typeof ClientFilter>) {
	return selectClients(tx, agencyId, ClientFilter.parse(filter));
}

/**
 * A full client record. Nested data follows the agency's plan: health info
 * needs `charting`, goals `goals`, medications `mar` (trpc-router.md).
 */
export async function getClient(
	tx: Tx,
	agencyId: string,
	features: readonly FeatureFlag[],
	id: string
) {
	const client = await selectClient(tx, agencyId, id);
	if (!client) throw new ServiceError('NOT_FOUND', 'Person not found');
	const has = (f: FeatureFlag) => features.includes(f);
	return {
		...client,
		healthInfo: has('charting') ? await selectHealthInfo(tx, agencyId, id) : null,
		goals: has('goals') ? await selectActiveGoals(tx, agencyId, id) : [],
		medications: has('mar') ? await listMedications(tx, agencyId, id) : []
	};
}

async function requireHome(tx: Tx, agencyId: string, homeId: string) {
	if (!(await getHome(tx, agencyId, homeId)))
		throw new ServiceError('VALIDATION_FAILED', 'That home is not in your agency');
}

export async function createClient(tx: Tx, agencyId: string, input: z.infer<typeof NewClient>) {
	const data = NewClient.parse(input);
	await requireHome(tx, agencyId, data.homeId);
	const client = await insertClient(tx, {
		agency_id: agencyId,
		home_id: data.homeId,
		name: data.name,
		first_name: data.firstName ?? data.name.split(/\s+/)[0],
		initials: initialsOf(data.name),
		info: data.info,
		behaviors: data.behaviors
	});
	// Always create the health row, so updateHealth never has to guess.
	await upsertHealthInfo(tx, {
		agency_id: agencyId,
		client_id: client.id,
		home_id: data.homeId,
		...data.healthInfo
	});
	return { id: client.id, name: client.name, homeId: client.homeId, createdAt: client.createdAt };
}

export async function updateClient(tx: Tx, agencyId: string, input: z.infer<typeof ClientChanges>) {
	const data = ClientChanges.parse(input);
	if (data.homeId) await requireHome(tx, agencyId, data.homeId);
	const row = await updateClientRow(tx, agencyId, data.id, {
		name: data.name,
		initials: data.name ? initialsOf(data.name) : undefined,
		first_name: data.firstName,
		home_id: data.homeId,
		info: data.info,
		behaviors: data.behaviors,
		active: data.active
	});
	if (!row) throw new ServiceError('NOT_FOUND', 'Person not found');
	return {
		id: row.id,
		name: row.name,
		homeId: row.homeId,
		active: row.active,
		updatedAt: row.updatedAt
	};
}

export async function updateHealth(tx: Tx, agencyId: string, input: z.infer<typeof HealthChanges>) {
	const { clientId, ...fields } = HealthChanges.parse(input);
	const client = await selectClient(tx, agencyId, clientId);
	if (!client) throw new ServiceError('NOT_FOUND', 'Person not found');
	await upsertHealthInfo(tx, {
		agency_id: agencyId,
		client_id: clientId,
		home_id: client.homeId,
		...fields
	});
	return { clientId, ...(await selectHealthInfo(tx, agencyId, clientId)) };
}

export async function archiveClient(tx: Tx, agencyId: string, id: string) {
	const row = await updateClientRow(tx, agencyId, id, { active: false });
	if (!row) throw new ServiceError('NOT_FOUND', 'Person not found');
	return { id: row.id, active: row.active, updatedAt: row.updatedAt };
}

// ─── Case notes (services.md §12: addCaseNote, getCaseNotes) ───────────────
// Care coordination, ISP meetings, family calls: distinct from shift and
// behavior notes. Append-only through the API; corrections are new notes.

export const NewCaseNote = z.object({
	clientId: z.uuid(),
	body: z.string().trim().min(1).max(10_000),
	/** What the note is about (US-15); "other" when not given */
	category: z.enum(CASE_NOTE_CATEGORIES).default('other')
});

export const CaseNoteFilter = z.object({
	clientId: z.uuid(),
	limit: z.number().int().min(1).max(100).default(50),
	offset: z.number().int().min(0).max(100_000).default(0)
});

export async function addCaseNote(
	tx: Tx,
	agencyId: string,
	author: { profileId: string; name: string },
	input: z.input<typeof NewCaseNote>
) {
	const data = NewCaseNote.parse(input);
	if (!(await selectClient(tx, agencyId, data.clientId)))
		throw new ServiceError('NOT_FOUND', 'Person not found');
	return insertCaseNote(tx, {
		agency_id: agencyId,
		client_id: data.clientId,
		author_id: author.profileId,
		author_name: author.name,
		created_by: author.profileId,
		body: data.body,
		category: data.category
	});
}

export async function listCaseNotes(
	tx: Tx,
	agencyId: string,
	input: z.input<typeof CaseNoteFilter>
) {
	const f = CaseNoteFilter.parse(input);
	if (!(await selectClient(tx, agencyId, f.clientId)))
		throw new ServiceError('NOT_FOUND', 'Person not found');
	return selectCaseNotes(tx, agencyId, f.clientId, f.limit, f.offset);
}
