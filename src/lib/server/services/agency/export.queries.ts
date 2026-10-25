// Full agency export (security.md "Agency data export"): every table that
// holds the agency's records, read page by page in primary-key order. Columns
// that only serve sign-in, keys or device sync never leave (DROPPED_COLUMNS).
import { and, asc, eq, getTableColumns, gt, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { Tx } from '../../db';
import * as schema from '../../db/schema';

const t = <T extends PgTable>(table: T) => table as unknown as PgTable;

/** Exported tables, in file order. Each has `id` and (except agencies) `agency_id`. */
export const EXPORT_TABLES = {
	agencies: t(schema.agencies),
	homes: t(schema.homes),
	rooms: t(schema.rooms),
	profiles: t(schema.profiles),
	clients: t(schema.clients),
	client_health_info: t(schema.clientHealthInfo),
	goal_templates: t(schema.goalTemplates),
	goals: t(schema.goals),
	medications: t(schema.medications),
	medication_history: t(schema.medicationHistory),
	mar_records: t(schema.marRecords),
	controlled_counts: t(schema.controlledCounts),
	notes: t(schema.notes),
	note_goals: t(schema.noteGoals),
	note_history: t(schema.noteHistory),
	health_entries: t(schema.healthEntries),
	attendance: t(schema.attendance),
	incidents: t(schema.incidents),
	case_notes: t(schema.caseNotes),
	referrals: t(schema.referrals),
	referral_notes: t(schema.referralNotes),
	messages: t(schema.messages),
	message_photos: t(schema.messagePhotos),
	message_reads: t(schema.messageReads),
	schedule_slots: t(schema.scheduleSlots),
	schedule_templates: t(schema.scheduleTemplates),
	clock_records: t(schema.clockRecords),
	coverage_requests: t(schema.coverageRequests),
	coverage_candidates: t(schema.coverageCandidates),
	coverage_steps: t(schema.coverageSteps),
	coverage_offer_evidence: t(schema.coverageOfferEvidence),
	events: t(schema.events),
	notifications: t(schema.notifications),
	audit_log: t(schema.auditLog)
} as const;
export type ExportTable = keyof typeof EXPORT_TABLES;

/**
 * Agency tables left out, and why. A test checks every table in the schema is
 * either exported or listed here, so a new table can't be missed silently.
 */
export const SKIPPED_TABLES: Record<string, string> = {
	api_keys: 'integration credentials (hashes)',
	webhooks: 'integration endpoints and sealed signing secrets',
	webhook_deliveries: 'delivery attempts to the agency’s own systems',
	device_keys: 'per-device encryption keys',
	device_tokens: 'push tokens',
	sync_checkpoints: 'device sync state',
	report_jobs: 'temporary export jobs',
	notification_preferences: 'per-user alert settings',
	user_settings: 'per-user app settings',
	email_suppressions: 'delivery bookkeeping',
	email_bounces: 'delivery bookkeeping',
	sms_inbound_messages: 'raw SMS replies, already applied to coverage and opt-outs',
	sms_carrier_consents: 'hashed phone numbers'
};

/** Secrets and sign-in identifiers, removed from rows and from audit_log values. */
export const DROPPED_COLUMNS = new Set([
	'auth_uid',
	'key_hash',
	'secret_hash',
	'secret_sealed',
	'key_ciphertext',
	'witness_sign_in',
	'phone_hash',
	'token',
	'checkpoint_token'
]);

export function exportColumns(table: ExportTable): Record<string, PgColumn> {
	const all = getTableColumns(EXPORT_TABLES[table]) as Record<string, PgColumn>;
	return Object.fromEntries(Object.entries(all).filter(([, c]) => !DROPPED_COLUMNS.has(c.name)));
}

/** One page after `afterId` (keyset, so pages stay stable in one snapshot). */
export async function exportPage(
	tx: Tx,
	table: ExportTable,
	agencyId: string,
	afterId: string | null,
	limit: number
) {
	const source = EXPORT_TABLES[table];
	const all = getTableColumns(source) as Record<string, PgColumn>;
	const id = all.id;
	const scope: SQL = table === 'agencies' ? eq(id, agencyId) : eq(all.agency_id, agencyId);
	const columns = exportColumns(table);
	const rows = await tx
		.select(columns)
		.from(source)
		.where(afterId ? and(scope, gt(id, afterId)) : scope)
		.orderBy(asc(id))
		.limit(limit);
	return { columns: Object.values(columns).map((c) => c.name), rows };
}
