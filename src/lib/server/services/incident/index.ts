// Incident Service (services.md): incident reports (GER in the Therap preset).
import { z } from 'zod';
import {
	INCIDENT_TYPES,
	incidentNotifyRules,
	parseIncidentRules,
	parseReportDetails,
	parseWitnessList,
	witnessText,
	reportDetailsError
} from '../../../domain/index.ts';
import type { Tx } from '../../db';
import { ServiceError } from '../../errors';
import type { CurrentUser } from '../auth/index.ts';
import { findVisibleClient } from '../charting/index.ts';
import { notifyHomeSupervisors } from '../notification/index.ts';
import {
	addNotifiedParty,
	agencySettings,
	findIncident,
	insertIncident,
	selectIncidents,
	updateIncident,
	type IncidentFilter
} from './incident.queries';

const text = (max = 4000) => z.string().trim().max(max).nullish();

export const NewIncident = z.object({
	id: z.uuid(),
	clientId: z.uuid(),
	type: z.enum(INCIDENT_TYPES),
	severity: z.enum(['Low', 'Medium', 'High']),
	occurredAt: z.coerce.date(),
	location: text(200),
	description: z.string().trim().min(1, 'Describe what happened').max(8000),
	antecedent: text(),
	injured: text(200),
	injuryDetail: text(),
	staffAction: text(),
	medicalFollowup: text(),
	witnesses: text(500),
	notifiedParties: z.array(z.string().trim().max(100)).max(20).default([]),
	/** Optional state-reporting details; unknown fields and values are dropped. */
	reportDetails: z.unknown().optional().transform(parseReportDetails),
	/** Each witness's name and role; `witnesses` keeps a readable copy */
	witnessList: z.unknown().optional().transform(parseWitnessList)
});

/**
 * Files an incident report authored by the caller (incident.create). The
 * home's supervisors are notified; high severity is urgent. Returns who must
 * be told and how soon (placeholder rules until the agency sets its state's).
 */
export async function createIncident(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	input: z.input<typeof NewIncident>
) {
	const i = NewIncident.parse(input);
	if (i.occurredAt.getTime() > Date.now() + 5 * 60_000) {
		throw new ServiceError('VALIDATION_FAILED', 'The incident time is in the future');
	}
	const detailsError = reportDetailsError(i.reportDetails);
	if (detailsError) throw new ServiceError('VALIDATION_FAILED', detailsError);
	const client = await findVisibleClient(tx, agencyId, i.clientId);
	if (!client) throw new ServiceError('NOT_FOUND', 'That person is not in your homes');
	const row = await insertIncident(tx, {
		id: i.id,
		agency_id: agencyId,
		client_id: i.clientId,
		author_id: user.profileId,
		author_name: user.name,
		created_by: user.profileId,
		type: i.type,
		severity: i.severity,
		occurred_at: i.occurredAt,
		location: i.location ?? null,
		description: i.description,
		antecedent: i.antecedent ?? null,
		injured: i.injured ?? null,
		injury_detail: i.injuryDetail ?? null,
		staff_action: i.staffAction ?? null,
		medical_followup: i.medicalFollowup ?? null,
		witnesses: i.witnesses ?? (i.witnessList.length ? witnessText(i.witnessList) : null),
		witness_list: i.witnessList,
		notified_parties: i.notifiedParties,
		report_details: i.reportDetails
	});
	if (row) {
		const high = i.severity === 'High';
		await notifyHomeSupervisors(tx, agencyId, client.homeId, {
			type: high ? 'incident_high_severity' : 'incident_reported',
			priority: high ? 1 : 2,
			// PHI-free: no incident type, it can identify the person in a small home.
			title: high ? 'High-severity incident reported' : 'New incident reported',
			referenceId: i.id,
			referenceType: 'incidents'
		});
	}
	return {
		id: i.id,
		status: 'open' as const,
		createdAt: row?.createdAt ?? null,
		created: !!row,
		mustNotify: incidentNotifyRules(
			i.severity,
			i.type,
			parseIncidentRules(await agencySettings(tx, agencyId))
		)
	};
}

export async function getIncident(tx: Tx, agencyId: string, id: string) {
	return findIncident(tx, agencyId, id);
}

export function listIncidents(tx: Tx, agencyId: string, filter: IncidentFilter) {
	return selectIncidents(tx, agencyId, filter);
}

function supervisorsOnly(user: CurrentUser) {
	if (user.role === 'caregiver')
		throw new ServiceError('FORBIDDEN', 'Only supervisors can review incidents');
}

/** Supervisor review: follow-up notes, status reviewed (incident.review). */
export async function reviewIncident(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	id: string,
	followupNotes: string
) {
	supervisorsOnly(user);
	const notes = z.string().trim().min(1, 'Add follow-up notes').max(8000).parse(followupNotes);
	const row = await updateIncident(tx, agencyId, id, { followup_notes: notes, status: 'reviewed' });
	if (!row) throw new ServiceError('NOT_FOUND', 'Incident not found');
	return { followupNotes: notes, status: row.status, updatedAt: row.updatedAt };
}

/** Records that a party (guardian, case manager, state) was told (incident.markNotified). */
export async function markNotified(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	id: string,
	party: string
) {
	supervisorsOnly(user);
	const p = z.string().trim().min(1).max(100).parse(party);
	const row = await addNotifiedParty(tx, agencyId, id, p);
	if (!row) throw new ServiceError('NOT_FOUND', 'Incident not found');
	return { notifiedParties: row.notifiedParties ?? [], updatedAt: row.updatedAt };
}
