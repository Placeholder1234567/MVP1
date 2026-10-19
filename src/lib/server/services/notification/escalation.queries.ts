import { and, count, eq, gte, inArray, or } from 'drizzle-orm';
import type { Tx } from '../../db';
import {
	agencies,
	clockRecords,
	coverageRequests,
	homes,
	incidents,
	marRecords,
	notes,
	notifications,
	profiles
} from '../../db/schema';

/**
 * The in-app rows of one event: every recipient's copy of the same type and
 * referenced record (or the one notification, when there's no reference).
 * Reading any of them acknowledges the event (inbox.queries.ts markInboxRead).
 */
export function eventRows(
	tx: Tx,
	agencyId: string,
	type: string,
	referenceId: string | null,
	notificationId: string
) {
	return tx
		.select({
			id: notifications.id,
			profileId: notifications.profile_id,
			readAt: notifications.read_at,
			title: notifications.title,
			referenceType: notifications.reference_type
		})
		.from(notifications)
		.where(
			and(
				eq(notifications.agency_id, agencyId),
				eq(notifications.type, type),
				eq(notifications.channel, 'in_app'),
				referenceId
					? or(eq(notifications.reference_id, referenceId), eq(notifications.id, notificationId))
					: eq(notifications.id, notificationId)
			)
		);
}

export async function setEventStatus(
	tx: Tx,
	agencyId: string,
	ids: string[],
	status: 'escalated' | 'escalation_exhausted'
) {
	if (!ids.length) return;
	await tx
		.update(notifications)
		.set({ status, updated_at: new Date() })
		.where(and(eq(notifications.agency_id, agencyId), inArray(notifications.id, ids)));
}

// ─── Daily digest (notifications.md §2.16, §7) ──────────────────────────────

export function agencyClocks(tx: Tx) {
	return tx
		.select({
			id: agencies.id,
			timeZone: agencies.timezone,
			tier: agencies.subscription_tier,
			enabledFeatures: agencies.enabled_features
		})
		.from(agencies);
}

export function digestRecipients(tx: Tx, agencyId: string) {
	return tx
		.select({ id: profiles.id, role: profiles.role, homeIds: profiles.home_ids })
		.from(profiles)
		.where(
			and(
				eq(profiles.agency_id, agencyId),
				eq(profiles.active, true),
				inArray(profiles.role, ['supervisor', 'admin'])
			)
		);
}

export function homeNames(tx: Tx, agencyId: string) {
	return tx
		.select({ id: homes.id, name: homes.name })
		.from(homes)
		.where(eq(homes.agency_id, agencyId));
}

/** Counts per home only: the digest never carries client names or clinical detail. */
export async function digestCounts(tx: Tx, agencyId: string, since: Date) {
	// One query at a time: they share the transaction's connection.
	const pendingNotes = await tx
		.select({ homeId: notes.home_id, n: count() })
		.from(notes)
		.where(and(eq(notes.agency_id, agencyId), eq(notes.status, 'submitted')))
		.groupBy(notes.home_id);
	const openIncidents = await tx
		.select({ homeId: incidents.home_id, n: count() })
		.from(incidents)
		.where(and(eq(incidents.agency_id, agencyId), eq(incidents.status, 'open')))
		.groupBy(incidents.home_id);
	const refusals = await tx
		.select({ homeId: marRecords.home_id, n: count() })
		.from(marRecords)
		.where(
			and(
				eq(marRecords.agency_id, agencyId),
				eq(marRecords.status, 'refused'),
				gte(marRecords.recorded_at, since)
			)
		)
		.groupBy(marRecords.home_id);
	const unacknowledged = await tx
		.select({ homeId: marRecords.home_id, n: count() })
		.from(marRecords)
		.where(
			and(
				eq(marRecords.agency_id, agencyId),
				eq(marRecords.status, 'refused'),
				eq(marRecords.acknowledged, false)
			)
		)
		.groupBy(marRecords.home_id);
	const filled = await tx
		.select({ homeId: coverageRequests.home_id, n: count() })
		.from(coverageRequests)
		.where(
			and(
				eq(coverageRequests.agency_id, agencyId),
				eq(coverageRequests.status, 'filled'),
				gte(coverageRequests.filled_at, since)
			)
		)
		.groupBy(coverageRequests.home_id);
	const unfilled = await tx
		.select({ homeId: coverageRequests.home_id, n: count() })
		.from(coverageRequests)
		.where(and(eq(coverageRequests.agency_id, agencyId), eq(coverageRequests.status, 'unfilled')))
		.groupBy(coverageRequests.home_id);
	const clock = await tx
		.select({ homeId: clockRecords.home_id, n: count() })
		.from(clockRecords)
		.where(
			and(
				eq(clockRecords.agency_id, agencyId),
				eq(clockRecords.verified, false),
				eq(clockRecords.acknowledged, false),
				gte(clockRecords.clock_in_at, since)
			)
		)
		.groupBy(clockRecords.home_id);
	return { pendingNotes, openIncidents, refusals, unacknowledged, filled, unfilled, clock };
}
