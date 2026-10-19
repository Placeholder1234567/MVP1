// Auth Service (services.md §1): resolves the signed-in Identity Platform user
// to their Guad profile and role. Session handling itself is in ../../identity.
import {
	mfaRequirement,
	requiredRolesFromSettings,
	sessionMinutes,
	type MfaRequirement
} from '../../../domain/index.ts';
import { resolveFeatures } from '../../../entitlements/tier-features.ts';
import { withService, type Tx } from '../../db';
import {
	findActiveProfileByAuthUid,
	findAgencySettingsByAuthUid,
	findMfaFacts,
	findProfile,
	setLastSignIn,
	setMfaEnabled
} from './auth.queries';
import { ROLE_RANK, type CurrentUser, type Role } from './auth.types';

export type { CurrentUser, Role } from './auth.types';
export { saveDisclosure, saveTheme, DisclosureInput, ThemeInput } from './settings';
export {
	getStaff,
	inviteStaff,
	InviteInput,
	listStaff,
	OwnProfileInput,
	resetStaffMfa,
	StaffFilter,
	StaffUpdateInput,
	updateOwnProfile,
	createStaffAccount,
	updateStaff
} from './staff';

/**
 * The profile for a verified session. Runs as app_service because the claims
 * withUser() needs come from this very lookup. Returns null when there is no
 * profile or it has been deactivated.
 */
export async function getCurrentUser(authUid: string): Promise<CurrentUser | null> {
	const row = await withService((tx) => findActiveProfileByAuthUid(tx, authUid));
	if (!row) return null;
	return {
		authUid,
		profileId: row.id,
		agencyId: row.agencyId,
		role: row.role,
		name: row.name,
		homeIds: row.homeIds ?? [],
		medCertified: row.medCertified,
		timeZone: row.timeZone,
		features: [...resolveFeatures(row.tier, row.enabledFeatures)].sort(),
		claims: { agency_id: row.agencyId, role: row.role, profile_id: row.id }
	};
}

/** How long a new session for this account may last, from its agency's setting (ms). */
export async function sessionLengthMs(authUid: string): Promise<number> {
	const settings = await withService((tx) => findAgencySettingsByAuthUid(tx, authUid));
	return sessionMinutes(settings) * 60_000;
}

/** Records that this person just got a session (security.md "Automated Detection"). */
export async function recordSignIn(user: CurrentUser, at = new Date()) {
	await withService((tx) => setLastSignIn(tx, user.agencyId, user.profileId, at));
}

/** The caller's own profile, read as the caller (RLS applies). */
export function getProfile(tx: Tx, agencyId: string, profileId: string) {
	return findProfile(tx, agencyId, profileId);
}

/** Role hierarchy check: caregiver < supervisor < admin. */
export function hasRole(user: Pick<CurrentUser, 'role'>, minRole: Role): boolean {
	return ROLE_RANK[user.role] >= ROLE_RANK[minRole];
}

/**
 * Whether this sign-in may get a session (security.md "MFA Policy").
 * `usedSecondFactor` comes from the verified ID token. Records that the
 * profile has MFA the first time it is used, for the admin staff list.
 */
export async function checkMfa(
	user: CurrentUser,
	usedSecondFactor: boolean,
	now = new Date()
): Promise<MfaRequirement & { satisfied: boolean }> {
	const facts = await withService((tx) => findMfaFacts(tx, user.profileId));
	if (!facts) return { kind: 'required', satisfied: false };
	if (usedSecondFactor && !facts.mfaEnabled) {
		await withService((tx) => setMfaEnabled(tx, user.agencyId, user.profileId));
	}
	const requirement = mfaRequirement(
		user.role,
		facts.createdAt,
		now,
		requiredRolesFromSettings(facts.agencySettings)
	);
	return { ...requirement, satisfied: usedSecondFactor || requirement.kind !== 'required' };
}
