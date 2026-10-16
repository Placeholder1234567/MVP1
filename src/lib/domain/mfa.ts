// MFA policy (security.md "MFA Policy"): TOTP through Identity Platform.
//   admin       required immediately
//   supervisor  required after a 30-day grace period from account creation
//   caregiver   optional, unless the agency requires it
//               (agencies.settings.mfa_required_roles)

export type MfaRequirement =
	{ kind: 'required' } | { kind: 'grace'; daysLeft: number } | { kind: 'optional' };

export const SUPERVISOR_MFA_GRACE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export function mfaRequirement(
	role: 'caregiver' | 'supervisor' | 'admin',
	accountCreated: Date,
	now: Date,
	agencyRequiredRoles: readonly string[] = []
): MfaRequirement {
	if (role === 'admin' || agencyRequiredRoles.includes(role)) return { kind: 'required' };
	if (role === 'supervisor') {
		const left =
			SUPERVISOR_MFA_GRACE_DAYS - Math.floor((now.getTime() - accountCreated.getTime()) / DAY_MS);
		return left > 0 ? { kind: 'grace', daysLeft: left } : { kind: 'required' };
	}
	return { kind: 'optional' };
}

/** The roles an agency's settings JSON requires MFA for (anything malformed is ignored). */
export function requiredRolesFromSettings(settings: unknown): string[] {
	const roles = (settings as { mfa_required_roles?: unknown } | null)?.mfa_required_roles;
	return Array.isArray(roles) ? roles.filter((r): r is string => typeof r === 'string') : [];
}
