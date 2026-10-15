import { and, eq } from 'drizzle-orm';
import type { Tx } from '../../db';
import { profiles } from '../../db/schema';

/**
 * Active staff with this phone number (E.164). Looked up across agencies,
 * because an inbound text carries only the number; each match is then
 * handled inside its own agency.
 */
export function activeProfilesByPhone(tx: Tx, phone: string) {
	return tx
		.select({
			id: profiles.id,
			agencyId: profiles.agency_id,
			authUid: profiles.auth_uid,
			role: profiles.role
		})
		.from(profiles)
		.where(and(eq(profiles.phone, phone), eq(profiles.active, true)));
}
