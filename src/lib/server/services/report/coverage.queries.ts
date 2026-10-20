import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { Tx } from '../../db';
import {
	agencies,
	profiles,
	homes,
	coverageRequests,
	coverageCandidates,
	coverageSteps,
	notifications
} from '../../db/schema';

/** Fresh facts under the caller's existing RLS; never read as app_service. */
export async function coverageViewer(tx: Tx, agencyId: string, profileId: string) {
	return (
		await tx
			.select({
				role: profiles.role,
				homeIds: profiles.home_ids,
				authUid: profiles.auth_uid,
				tier: agencies.subscription_tier,
				enabledFeatures: agencies.enabled_features,
				timeZone: agencies.timezone
			})
			.from(profiles)
			.innerJoin(agencies, eq(agencies.id, profiles.agency_id))
			.where(
				and(eq(profiles.agency_id, agencyId), eq(profiles.id, profileId), eq(profiles.active, true))
			)
			.limit(1)
			.for('share')
	)[0];
}
export async function coverageHome(tx: Tx, agencyId: string, homeId: string) {
	return (
		await tx
			.select({ id: homes.id, name: homes.name })
			.from(homes)
			.where(and(eq(homes.agency_id, agencyId), eq(homes.id, homeId)))
			.limit(1)
	)[0];
}
export function coverageRequestsForReport(
	tx: Tx,
	agencyId: string,
	homeId: string,
	fromDay: string,
	toDay: string
) {
	return tx
		.select({
			id: coverageRequests.id,
			day: coverageRequests.day,
			shift: coverageRequests.shift,
			calledOutBy: coverageRequests.called_out_by,
			reason: coverageRequests.reason,
			status: coverageRequests.status,
			startedAt: coverageRequests.started_at,
			filledBy: coverageRequests.filled_by,
			filledAt: coverageRequests.filled_at,
			createdAt: coverageRequests.created_at
		})
		.from(coverageRequests)
		.where(
			and(
				eq(coverageRequests.agency_id, agencyId),
				eq(coverageRequests.home_id, homeId),
				gte(coverageRequests.day, fromDay),
				lte(coverageRequests.day, toDay)
			)
		)
		.orderBy(asc(coverageRequests.day), asc(coverageRequests.id))
		.limit(1001);
}
export function coverageCandidatesForReport(tx: Tx, agencyId: string, ids: string[]) {
	if (!ids.length) return Promise.resolve([]);
	return tx
		.select({
			id: coverageCandidates.id,
			requestId: coverageCandidates.coverage_request_id,
			staffId: coverageCandidates.profile_id,
			eligible: coverageCandidates.eligible,
			eligibilityReason: coverageCandidates.eligibility_reason,
			reply: coverageCandidates.reply,
			repliedAt: coverageCandidates.replied_at,
			createdAt: coverageCandidates.created_at
		})
		.from(coverageCandidates)
		.where(
			and(
				eq(coverageCandidates.agency_id, agencyId),
				inArray(coverageCandidates.coverage_request_id, ids)
			)
		)
		.orderBy(asc(coverageCandidates.coverage_request_id), asc(coverageCandidates.id))
		.limit(1001);
}
export function coverageActivityForReport(tx: Tx, agencyId: string, homeId: string, ids: string[]) {
	if (!ids.length) return Promise.resolve([]);
	return tx
		.select({
			id: coverageSteps.id,
			requestId: coverageSteps.coverage_request_id,
			description: coverageSteps.description,
			occurredAt: coverageSteps.occurred_at
		})
		.from(coverageSteps)
		.where(
			and(
				eq(coverageSteps.agency_id, agencyId),
				eq(coverageSteps.home_id, homeId),
				inArray(coverageSteps.coverage_request_id, ids)
			)
		)
		.orderBy(
			asc(coverageSteps.coverage_request_id),
			asc(coverageSteps.occurred_at),
			asc(coverageSteps.id)
		)
		.limit(1001);
}
/** Existing notification RLS remains authoritative, including admin-versus-own visibility. */
export function coverageNotificationsForReport(tx: Tx, agencyId: string, ids: string[]) {
	if (!ids.length) return Promise.resolve([]);
	return tx
		.select({
			id: notifications.id,
			requestId: notifications.reference_id,
			staffId: notifications.profile_id,
			channel: notifications.channel,
			status: notifications.status,
			createdAt: notifications.created_at,
			sentAt: notifications.sent_at,
			readAt: notifications.read_at
		})
		.from(notifications)
		.where(
			and(
				eq(notifications.agency_id, agencyId),
				eq(notifications.reference_type, 'coverage_requests'),
				eq(notifications.type, 'coverage_offer'),
				inArray(notifications.reference_id, ids)
			)
		)
		.orderBy(asc(notifications.reference_id), asc(notifications.created_at), asc(notifications.id))
		.limit(1001);
}
