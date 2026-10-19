// Health Service (services.md): vitals, seizures, illness, visits and bowel observations.
// Vital flags come from the shared domain rules, so the device shows the same
// warning offline that the server records.
import { z } from 'zod';
import {
	healthFlags,
	healthReading,
	bowelDataError,
	BOWEL_STATUSES,
	type HealthKind,
	type HEALTH_READING_LIMITS
} from '../../../domain/clinical.ts';
import { parseVitalLimits, VITAL_LIMITS, type VitalLimits } from '../../../domain/vitals.ts';
import type { Tx } from '../../db';
import { ServiceError } from '../../errors';
import type { CurrentUser } from '../auth/index.ts';
import { findVisibleClient as findClient } from '../charting/index.ts';
import { notifyHomeSupervisors } from '../notification/index.ts';
import {
	acknowledgeHealthEntry,
	insertHealthEntry,
	storedVitalLimits,
	previousWeight,
	selectHealthEntries,
	type HealthFilter
} from './health.queries';

const num = (key: keyof typeof HEALTH_READING_LIMITS) =>
	z
		.unknown()
		.transform((value, ctx) => {
			const parsed = healthReading(key, value);
			if (!parsed.ok) {
				ctx.addIssue({ code: 'custom', message: 'Check the health reading' });
				return z.NEVER;
			}
			return parsed.value;
		})
		.optional();
const text = z.string().trim().max(1000).nullish();
const time = z
	.string()
	.regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
	.nullish();

const DATA = {
	vitals: z
		.object({
			temp: num('temp'),
			pulse: num('pulse'),
			systolic: num('systolic'),
			diastolic: num('diastolic'),
			respiration: num('respiration'),
			oxygen: num('oxygen'),
			weight: num('weight'),
			glucose: num('glucose')
		})
		.transform((data) =>
			Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))
		)
		.refine((data) => Object.keys(data).length > 0, 'Enter at least one reading.'),
	bowel: z
		.strictObject({ status: z.enum(BOWEL_STATUSES), time, consistency: text, notes: text })
		.superRefine((data, ctx) => {
			const error = bowelDataError(data);
			if (error) ctx.addIssue({ code: 'custom', message: error });
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

const Json = (v: unknown) => {
	if (typeof v !== 'string') return v;
	try {
		return JSON.parse(v);
	} catch {
		return undefined;
	}
};

export const NewHealthEntry = z.object({
	id: z.uuid(),
	clientId: z.uuid(),
	kind: z.enum(['vitals', 'seizure', 'illness', 'appointment', 'bowel']),
	data: z.preprocess(Json, z.record(z.string(), z.unknown())),
	recordedAt: z.coerce.date().optional()
});

export function parseHealthData(kind: HealthKind, data: unknown) {
	const result = DATA[kind].safeParse(data);
	if (!result.success) throw new ServiceError('VALIDATION_FAILED', 'Check the health entry fields');
	return result.data;
}

/** Metric names outside the limits, as stored in health_entries.flags. */
export function flagsFor(
	kind: string,
	data: Record<string, unknown>,
	limits: VitalLimits = VITAL_LIMITS,
	lastWeight: number | null = null
): string[] {
	return healthFlags(kind, data, limits, lastWeight);
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
	const data = parseHealthData(entry.kind, entry.data);
	if (entry.recordedAt && entry.recordedAt.getTime() > Date.now() + 5 * 60_000) {
		throw new ServiceError('VALIDATION_FAILED', 'The time is in the future');
	}
	const client = await findClient(tx, agencyId, entry.clientId);
	if (!client) throw new ServiceError('NOT_FOUND', 'That person is not in your homes');
	// The person's own limits where a nurse or supervisor set them.
	const limits =
		entry.kind === 'vitals'
			? parseVitalLimits(await storedVitalLimits(tx, agencyId, entry.clientId))
			: VITAL_LIMITS;
	// A weight 5 lb or more from the last one is flagged too (charting-guide.md).
	const recordedAt = entry.recordedAt ?? new Date();
	const lastWeight =
		entry.kind === 'vitals' && (data as Record<string, unknown>).weight != null
			? await previousWeight(tx, agencyId, entry.clientId, recordedAt)
			: null;
	const flags = flagsFor(entry.kind, data, limits, lastWeight);
	const row = await insertHealthEntry(tx, {
		id: entry.id,
		agency_id: agencyId,
		client_id: entry.clientId,
		kind: entry.kind,
		data,
		flags,
		recorded_at: recordedAt,
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
