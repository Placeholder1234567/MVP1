// Bulk export queries (openapi.yaml /export/{type}). Each type lists its
// columns explicitly, so internal fields (auth IDs, plan data, sync flags)
// never leave, and every query is scoped by agency_id.
import { and, arrayContains, asc, count, eq, gt, gte, lt, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { ExportType } from '../../../domain/index.ts';
import type { Tx } from '../../db';
import {
	attendance,
	clientHealthInfo,
	clients,
	clockRecords,
	goals,
	healthEntries,
	incidents,
	marRecords,
	medications,
	notes,
	profiles,
	referrals,
	scheduleSlots
} from '../../db/schema';

interface ExportDef {
	table: PgTable;
	agency: PgColumn;
	id: PgColumn;
	updated: PgColumn;
	/** Home filter: a column equal to the home, or a uuid[] containing it */
	home: PgColumn | { array: PgColumn };
	columns: Record<string, PgColumn>;
}

const t = <T extends PgTable>(table: T) => table as unknown as PgTable;

export const EXPORTS: Record<ExportType, ExportDef> = {
	clients: {
		table: t(clients),
		agency: clients.agency_id,
		id: clients.id,
		updated: clients.updated_at,
		home: clients.home_id,
		columns: {
			id: clients.id,
			name: clients.name,
			first_name: clients.first_name,
			active: clients.active,
			home_id: clients.home_id,
			created_at: clients.created_at,
			updated_at: clients.updated_at
		}
	},
	staff: {
		table: t(profiles),
		agency: profiles.agency_id,
		id: profiles.id,
		updated: profiles.updated_at,
		home: { array: profiles.home_ids },
		columns: {
			id: profiles.id,
			name: profiles.name,
			email: profiles.email,
			phone: profiles.phone,
			role: profiles.role,
			home_ids: profiles.home_ids,
			med_certified: profiles.med_certified,
			active: profiles.active,
			created_at: profiles.created_at,
			updated_at: profiles.updated_at
		}
	},
	notes: {
		table: t(notes),
		agency: notes.agency_id,
		id: notes.id,
		updated: notes.updated_at,
		home: notes.home_id,
		columns: {
			id: notes.id,
			client_id: notes.client_id,
			home_id: notes.home_id,
			day: notes.day,
			note_type: notes.type,
			shift: notes.shift,
			status: notes.status,
			content: notes.content,
			supervisor_comment: notes.supervisor_comment,
			author_id: notes.author_id,
			author_name: notes.author_name,
			lomi_drafted: notes.lomi_drafted,
			created_at: notes.created_at,
			updated_at: notes.updated_at
		}
	},
	incidents: {
		table: t(incidents),
		agency: incidents.agency_id,
		id: incidents.id,
		updated: incidents.updated_at,
		home: incidents.home_id,
		columns: {
			id: incidents.id,
			client_id: incidents.client_id,
			home_id: incidents.home_id,
			type: incidents.type,
			severity: incidents.severity,
			description: incidents.description,
			occurred_at: incidents.occurred_at,
			location: incidents.location,
			antecedent: incidents.antecedent,
			injured: incidents.injured,
			injury_detail: incidents.injury_detail,
			staff_action: incidents.staff_action,
			medical_followup: incidents.medical_followup,
			witnesses: incidents.witnesses,
			notified_parties: incidents.notified_parties,
			status: incidents.status,
			followup_notes: incidents.followup_notes,
			author_id: incidents.author_id,
			author_name: incidents.author_name,
			created_at: incidents.created_at,
			updated_at: incidents.updated_at
		}
	},
	mar: {
		table: t(marRecords),
		agency: marRecords.agency_id,
		id: marRecords.id,
		updated: marRecords.updated_at,
		home: marRecords.home_id,
		columns: {
			id: marRecords.id,
			client_id: marRecords.client_id,
			home_id: marRecords.home_id,
			medication_id: marRecords.medication_id,
			day: marRecords.day,
			scheduled_time: marRecords.scheduled_time,
			status: marRecords.status,
			is_prn: marRecords.is_prn,
			reason: marRecords.reason,
			effect: marRecords.effect,
			recorded_at: marRecords.recorded_at,
			recorded_by: marRecords.recorded_by,
			recorded_by_name: marRecords.recorded_by_name,
			acknowledged: marRecords.acknowledged,
			amends_id: marRecords.amends_id,
			conflict_with: marRecords.conflict_with,
			created_at: marRecords.created_at,
			updated_at: marRecords.updated_at
		}
	},
	medications: {
		table: t(medications),
		agency: medications.agency_id,
		id: medications.id,
		updated: medications.updated_at,
		home: medications.home_id,
		columns: {
			id: medications.id,
			client_id: medications.client_id,
			home_id: medications.home_id,
			name: medications.name,
			dose: medications.dose,
			route: medications.route,
			scheduled_times: medications.scheduled_times,
			prn_instructions: medications.prn_instructions,
			notes: medications.notes,
			started_at: medications.started_at,
			stopped_at: medications.stopped_at,
			created_at: medications.created_at,
			updated_at: medications.updated_at
		}
	},
	health: {
		table: t(healthEntries),
		agency: healthEntries.agency_id,
		id: healthEntries.id,
		updated: healthEntries.updated_at,
		home: healthEntries.home_id,
		columns: {
			id: healthEntries.id,
			client_id: healthEntries.client_id,
			home_id: healthEntries.home_id,
			kind: healthEntries.kind,
			data: healthEntries.data,
			flags: healthEntries.flags,
			acknowledged: healthEntries.acknowledged,
			recorded_at: healthEntries.recorded_at,
			recorded_by: healthEntries.recorded_by,
			created_at: healthEntries.created_at,
			updated_at: healthEntries.updated_at
		}
	},
	attendance: {
		table: t(attendance),
		agency: attendance.agency_id,
		id: attendance.id,
		updated: attendance.updated_at,
		home: attendance.home_id,
		columns: {
			id: attendance.id,
			client_id: attendance.client_id,
			home_id: attendance.home_id,
			day: attendance.day,
			services: attendance.services,
			recorded_at: attendance.recorded_at,
			recorded_by: attendance.recorded_by,
			recorded_by_name: attendance.recorded_by_name,
			created_at: attendance.created_at,
			updated_at: attendance.updated_at
		}
	},
	clock_records: {
		table: t(clockRecords),
		agency: clockRecords.agency_id,
		id: clockRecords.id,
		updated: clockRecords.updated_at,
		home: clockRecords.home_id,
		columns: {
			id: clockRecords.id,
			profile_id: clockRecords.profile_id,
			home_id: clockRecords.home_id,
			clock_in_at: clockRecords.clock_in_at,
			clock_in_lat: clockRecords.clock_in_lat,
			clock_in_lng: clockRecords.clock_in_lng,
			clock_out_at: clockRecords.clock_out_at,
			clock_out_lat: clockRecords.clock_out_lat,
			clock_out_lng: clockRecords.clock_out_lng,
			accuracy: clockRecords.accuracy,
			distance_meters: clockRecords.distance_meters,
			verified: clockRecords.verified,
			manual_override: clockRecords.manual_override,
			reason: clockRecords.reason,
			acknowledged: clockRecords.acknowledged,
			created_at: clockRecords.created_at,
			updated_at: clockRecords.updated_at
		}
	},
	schedule: {
		table: t(scheduleSlots),
		agency: scheduleSlots.agency_id,
		id: scheduleSlots.id,
		updated: scheduleSlots.updated_at,
		home: scheduleSlots.home_id,
		columns: {
			id: scheduleSlots.id,
			home_id: scheduleSlots.home_id,
			day: scheduleSlots.day,
			shift: scheduleSlots.shift,
			assigned_to: scheduleSlots.assigned_to,
			status: scheduleSlots.status,
			created_at: scheduleSlots.created_at,
			updated_at: scheduleSlots.updated_at
		}
	},
	goals: {
		table: t(goals),
		agency: goals.agency_id,
		id: goals.id,
		updated: goals.updated_at,
		home: goals.home_id,
		columns: {
			id: goals.id,
			client_id: goals.client_id,
			home_id: goals.home_id,
			area: goals.area,
			text: goals.text,
			steps: goals.steps,
			frequency: goals.frequency,
			target: goals.target,
			started_at: goals.started_at,
			stopped_at: goals.stopped_at,
			created_at: goals.created_at,
			updated_at: goals.updated_at
		}
	},
	referrals: {
		table: t(referrals),
		agency: referrals.agency_id,
		id: referrals.id,
		updated: referrals.updated_at,
		home: referrals.assigned_home_id,
		columns: {
			id: referrals.id,
			client_name: referrals.client_name,
			contact_name: referrals.contact_name,
			contact_phone: referrals.contact_phone,
			contact_email: referrals.contact_email,
			source: referrals.source,
			status: referrals.status,
			assigned_home_id: referrals.assigned_home_id,
			notes: referrals.notes,
			created_at: referrals.created_at,
			updated_at: referrals.updated_at
		}
	}
};

/** Client health columns, only with include_health=true. */
const HEALTH_COLUMNS = {
	dob: clientHealthInfo.dob,
	allergies: clientHealthInfo.allergies,
	conditions: clientHealthInfo.conditions,
	diet: clientHealthInfo.diet,
	doctor: clientHealthInfo.doctor,
	guardian_name: clientHealthInfo.guardian
};

export interface ExportFilter {
	agencyId: string;
	homeId: string | null;
	start: Date | null;
	end: Date | null;
	since: Date | null;
}

function where(def: ExportDef, f: ExportFilter) {
	const w: SQL[] = [eq(def.agency, f.agencyId)];
	if (f.homeId)
		w.push(
			'array' in def.home ? arrayContains(def.home.array, [f.homeId]) : eq(def.home, f.homeId)
		);
	if (f.start) w.push(gte(def.updated, f.start));
	if (f.end) w.push(lt(def.updated, f.end));
	if (f.since) w.push(gt(def.updated, f.since));
	return and(...w);
}

export async function exportRows(
	tx: Tx,
	type: ExportType,
	f: ExportFilter,
	includeHealth: boolean,
	limit: number,
	offset: number
): Promise<{ columns: string[]; rows: Record<string, unknown>[]; total: number }> {
	const def = EXPORTS[type];
	const withHealth = type === 'clients' && includeHealth;
	const columns = withHealth ? { ...def.columns, ...HEALTH_COLUMNS } : def.columns;
	const base = tx.select(columns).from(def.table);
	const joined = withHealth
		? base.leftJoin(
				clientHealthInfo,
				and(
					eq(clientHealthInfo.client_id, clients.id),
					eq(clientHealthInfo.agency_id, clients.agency_id)
				)
			)
		: base;
	const rows = (await joined
		.where(where(def, f))
		.orderBy(asc(def.updated), asc(def.id))
		.limit(limit)
		.offset(offset)) as Record<string, unknown>[];
	const [n] = await tx.select({ n: count() }).from(def.table).where(where(def, f));
	return { columns: Object.keys(columns), rows, total: Number(n?.n ?? 0) };
}
