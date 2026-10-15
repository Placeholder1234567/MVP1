import { and, eq } from 'drizzle-orm';
import type { Tx } from '../../db';
import { agencies, profiles } from '../../db/schema';

/** Active profile for an Identity Platform UID, with its agency's time zone. */
export async function findActiveProfileByAuthUid(tx: Tx, authUid: string) {
	const [row] = await tx
		.select({
			id: profiles.id,
			agencyId: profiles.agency_id,
			role: profiles.role,
			name: profiles.name,
			homeIds: profiles.home_ids,
			medCertified: profiles.med_certified,
			timeZone: agencies.timezone
		})
		.from(profiles)
		.innerJoin(agencies, eq(agencies.id, profiles.agency_id))
		.where(and(eq(profiles.auth_uid, authUid), eq(profiles.active, true)))
		.limit(1);
	return row ?? null;
}
