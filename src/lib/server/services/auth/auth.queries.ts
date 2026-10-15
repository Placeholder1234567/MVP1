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

/** The caller's own profile (auth.me). */
export async function findProfile(tx: Tx, agencyId: string, profileId: string) {
	const [row] = await tx
		.select({
			id: profiles.id,
			agencyId: profiles.agency_id,
			email: profiles.email,
			phone: profiles.phone,
			name: profiles.name,
			initials: profiles.initials,
			role: profiles.role,
			homeIds: profiles.home_ids,
			medCertified: profiles.med_certified,
			mfaEnabled: profiles.mfa_enabled,
			avatarUrl: profiles.avatar_url,
			active: profiles.active,
			createdAt: profiles.created_at
		})
		.from(profiles)
		.where(and(eq(profiles.agency_id, agencyId), eq(profiles.id, profileId)))
		.limit(1);
	return row ?? null;
}
