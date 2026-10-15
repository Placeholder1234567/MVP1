import type { FeatureFlag } from '../../../entitlements/tier-features.ts';
import type { Claims } from '../../db';

export type Role = Claims['role'];

/** The signed-in user, as every request sees them (event.locals.user). */
export interface CurrentUser {
	authUid: string;
	profileId: string;
	agencyId: string;
	role: Role;
	name: string;
	homeIds: string[];
	medCertified: boolean;
	/** Agency time zone, for "what shift is it" questions */
	timeZone: string;
	/** The agency's effective features (tier + overrides), sorted (entitlements.md) */
	features: FeatureFlag[];
	/** Claims for withUser(): always built from the profile row */
	claims: Claims;
}

export const ROLE_RANK: Record<Role, number> = { caregiver: 0, supervisor: 1, admin: 2 };
