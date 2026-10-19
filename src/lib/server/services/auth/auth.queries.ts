import { and, eq } from 'drizzle-orm';
import type { Tx } from '../../db';
import { agencies, profiles } from '../../db/schema';

/** Active profile for an Identity Platform UID, with its agency's time zone and plan. */
export async function findActiveProfileByAuthUid(tx: Tx, authUid: string) {
	const [row] = await tx
		.select({
			id: profiles.id,
			agencyId: profiles.agency_id,
			role: profiles.role,
			name: profiles.name,
			homeIds: profiles.home_ids,
			medCertified: profiles.med_certified,
			timeZone: agencies.timezone,
			tier: agencies.subscription_tier,
			enabledFeatures: agencies.enabled_features
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

/** The agency settings of an active profile, by Identity Platform UID. */
export async function findAgencySettingsByAuthUid(tx: Tx, authUid: string) {
	const [row] = await tx
		.select({ settings: agencies.settings })
		.from(profiles)
		.innerJoin(agencies, eq(agencies.id, profiles.agency_id))
		.where(and(eq(profiles.auth_uid, authUid), eq(profiles.active, true)))
		.limit(1);
	return row?.settings ?? null;
}

/** What the MFA policy needs about a profile (security.md "MFA Policy"). */
export async function findMfaFacts(tx: Tx, profileId: string) {
	const [row] = await tx
		.select({
			createdAt: profiles.created_at,
			mfaEnabled: profiles.mfa_enabled,
			agencySettings: agencies.settings
		})
		.from(profiles)
		.innerJoin(agencies, eq(agencies.id, profiles.agency_id))
		.where(eq(profiles.id, profileId))
		.limit(1);
	return row ?? null;
}

export async function setMfaEnabled(tx: Tx, agencyId: string, profileId: string) {
	await tx
		.update(profiles)
		.set({ mfa_enabled: true, updated_at: new Date() })
		.where(and(eq(profiles.agency_id, agencyId), eq(profiles.id, profileId)));
}

/**
 * Stamps a new session for the access review. updated_at is left alone: the
 * column never syncs, so devices have nothing to download.
 */
export async function setLastSignIn(tx: Tx, agencyId: string, profileId: string, at: Date) {
	await tx
		.update(profiles)
		.set({ last_sign_in_at: at })
		.where(and(eq(profiles.agency_id, agencyId), eq(profiles.id, profileId)));
}
