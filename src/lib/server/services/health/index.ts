// Health Service (services.md): vitals, seizures, illness and appointments.
// Vital flags come from the shared domain rules, so the device shows the same
// warning offline that the server records.
import { z } from 'zod';
import { healthFlags } from '../../../domain/index.ts';
import type { Tx } from '../../db';
import { ServiceError } from '../../errors';
import type { CurrentUser } from '../auth/index.ts';
import { findVisibleClient as findClient } from '../charting/index.ts';
import { notifyHomeSupervisors } from '../notification/index.ts';
import {
	acknowledgeHealthEntry,
	insertHealthEntry,
	selectHealthEntries,
	type HealthFilter
} from './health.queries';

const num = z.coerce.number().finite().nullish();
const text = z.string().trim().max(1000).nullish();
const time = z
	.string()
	.regex(/^\d{2}:\d{2}$/)
	.nullish();

const DATA = {
	vitals: z.object({
		temp: num,
		pulse: num,
		systolic: num,
		diastolic: num,
		respiration: num,
		oxygen: num,
		weight: num
	}),
	// Keys match the device form (domain HEALTH_FIELDS). `type` and `triggers`
	// are kept for entries written before the form asked "What you saw".
	seizure: z.object({
		started: time,
		duration: text,
		observed: text,
		type: text,
		triggers: text,
		postIctal: text,
		actions: text
	}),
	illness: z.object({
		symptoms: text,
		onset: text,
		contagious: z.enum(['Not sure', 'Yes', 'No']).nullish(),
		actions: text
	}),
	appointment: z.object({
		date: z.iso.date().nullish(),
		provider: text,
		reason: text,
		outcome: text,
		nextVisit: text
	})
};

const Json = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);

export const NewHealthEntry = z.object({
	id: z.uuid(),
	clientId: z.uuid(),
	kind: z.enum(['vitals', 'seizure', 'illness', 'appointment']),
	data: z.preprocess(Json, z.record(z.string(), z.unknown())),
	recordedAt: z.coerce.date().optional()
});

/** Metric names outside the limits, as stored in health_entries.flags. */
export function flagsFor(kind: string, data: Record<string, unknown>): string[] {
	return healthFlags(kind, data);
}

/**
 * Records a health entry (health.create). Out-of-range vitals are flagged and
 * the home's supervisors get a PHI-free health_alert. Idempotent by ID.
 */
export async function createHealthEntry(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	input: z.input<typeof NewHealthEntry>
) {
	const entry = NewHealthEntry.parse(input);
	const data = DATA[entry.kind].parse(entry.data);
	if (entry.recordedAt && entry.recordedAt.getTime() > Date.now() + 5 * 60_000) {
		throw new ServiceError('VALIDATION_FAILED', 'The time is in the future');
	}
	const client = await findClient(tx, agencyId, entry.clientId);
	if (!client) throw new ServiceError('NOT_FOUND', 'That person is not in your homes');
	const flags = flagsFor(entry.kind, data);
	const row = await insertHealthEntry(tx, {
		id: entry.id,
		agency_id: agencyId,
		client_id: entry.clientId,
		kind: entry.kind,
		data,
		flags,
		recorded_at: entry.recordedAt ?? new Date(),
		recorded_by: user.profileId,
		created_by: user.profileId
	});
	if (row && flags.length) {
		await notifyHomeSupervisors(tx, agencyId, client.homeId, {
			type: 'health_alert',
			priority: 2,
			title: 'A health reading is outside the limits',
			referenceId: entry.id,
			referenceType: 'health_entries'
		});
	}
	return {
		id: entry.id,
		kind: entry.kind,
		data,
		flags,
		recordedAt: row?.recordedAt ?? null,
		created: !!row
	};
}

export function listHealthEntries(tx: Tx, agencyId: string, filter: HealthFilter) {
	return selectHealthEntries(tx, agencyId, filter);
}

export async function acknowledgeHealth(tx: Tx, agencyId: string, user: CurrentUser, id: string) {
	if (user.role === 'caregiver') {
		throw new ServiceError('FORBIDDEN', 'Only supervisors can acknowledge health entries');
	}
	const updatedAt = await acknowledgeHealthEntry(tx, agencyId, id);
	if (!updatedAt) throw new ServiceError('NOT_FOUND', 'Entry not found');
	return { updatedAt };
}
