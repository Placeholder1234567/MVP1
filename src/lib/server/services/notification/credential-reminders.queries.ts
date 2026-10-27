import { and, eq, gte, lte } from 'drizzle-orm';
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
