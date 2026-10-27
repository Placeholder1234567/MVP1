import { and, eq, gte, inArray, lt, lte } from 'drizzle-orm';
import type { Tx } from '../../db';
import { profiles, staffCredentials } from '../../db/schema';

/**
 * Active staff's credentials that expire on or before `until` and lapsed on
 * or after `since` (older lapses were reminded about already, or recorded
 * already lapsed by an admin who knows).
 */
export function credentialsExpiring(tx: Tx, agencyId: string, since: string, until: string) {
	return tx
		.select({
			id: staffCredentials.id,
			profileId: staffCredentials.profile_id,
			role: profiles.role,
			kind: staffCredentials.kind,
			name: staffCredentials.name,
			expiresOn: staffCredentials.expires_on
		})
		.from(staffCredentials)
		.innerJoin(profiles, eq(profiles.id, staffCredentials.profile_id))
		.where(
			and(
				eq(staffCredentials.agency_id, agencyId),
				eq(profiles.active, true),
				gte(staffCredentials.expires_on, since),
				lte(staffCredentials.expires_on, until)
			)
		)
		.limit(2000);
}

/**
 * Turns med_certified off for staff whose medication administration
 * credential has lapsed (its last valid day is before today). MAR
 * recording, coverage offers and witnessing all check that flag, and
 * devices get the change through sync. Returns how many changed.
 */
export async function revokeLapsedMedCertificates(tx: Tx, agencyId: string, today: string) {
	const lapsed = tx
		.select({ id: staffCredentials.profile_id })
		.from(staffCredentials)
		.where(
			and(
				eq(staffCredentials.agency_id, agencyId),
				eq(staffCredentials.kind, 'med_admin'),
				lt(staffCredentials.expires_on, today)
			)
		);
	const rows = await tx
		.update(profiles)
		.set({ med_certified: false, updated_at: new Date() })
		.where(
			and(
				eq(profiles.agency_id, agencyId),
				eq(profiles.med_certified, true),
				inArray(profiles.id, lapsed)
			)
		)
		.returning({ id: profiles.id });
	return rows.length;
}
