// Staff management (services.md §1 Auth Service: inviteUser, updateProfile,
// deactivateUser; trpc-router.md `staff.*`, `auth.updateProfile`).
//
// Identity Platform owns sign-in: inviting creates the account with no
// password and emails a password-setup link; deactivating disables the
// account and revokes its sessions (security.md "Revocation"). Profiles are
// never deleted. The profiles_protect_privileged_columns trigger is the
// backstop that keeps role, homes and status admin-only.
import { z } from 'zod';
import { initialsOf } from '../../../domain/index.ts';
import { afterCommit, asService, type RequestInfo, type Tx } from '../../db';
import { ServiceError } from '../../errors';
import {
	createIdentity,
	deleteIdentity,
	disableIdentity,
	activeIdentityByEmail,
	enableIdentity,
	passwordSetupLink,
	resetSecondFactors,
	revokeSessions
} from '../../identity.ts';
import { providers } from '../../messaging/index.ts';
import { listHomes } from '../home/index.ts';
import { adminAdded } from '../notification/index.ts';
import type { CurrentUser } from './auth.types';
import {
	activeUidsWithRoles,
	insertProfile,
	lockActiveAdmins,
	recordMfaReset,
	selectStaff,
	signInInUse,
	selectStaffMember,
	staffByEmail,
	updateProfileRow
} from './staff.queries';

const ROLES = ['caregiver', 'supervisor', 'admin'] as const;
const rank = (role: string) => ROLES.indexOf(role as (typeof ROLES)[number]);
/** E.164, as SMS matching (two-way replies) expects. */
const Phone = z
	.string()
	.regex(/^\+[1-9]\d{7,14}$/, 'Use the international format, e.g. +15551234567');

export const StaffFilter = z.object({
	homeId: z.uuid().optional(),
	role: z.enum(ROLES).optional(),
	active: z.boolean().optional()
});

export const InviteInput = z.object({
	email: z.email().max(254),
	name: z.string().trim().min(1).max(100),
	role: z.enum(ROLES),
	homeIds: z.array(z.uuid()).max(50),
	medCertified: z.boolean().optional()
});

export const StaffUpdateInput = z.object({
	id: z.uuid(),
	role: z.enum(ROLES).optional(),
	homeIds: z.array(z.uuid()).max(50).optional(),
	medCertified: z.boolean().optional(),
	active: z.boolean().optional()
});

export const OwnProfileInput = z.object({
	name: z.string().trim().min(1).max(100).optional(),
	phone: Phone.nullable().optional(),
	avatarUrl: z.url().max(2048).nullable().optional()
});

/** The caller can't see authUid; it's only for identity calls. */
function present<T extends { authUid?: string }>(row: T): Omit<T, 'authUid'> {
	const rest: Partial<T> = { ...row };
	delete rest.authUid;
	return rest as Omit<T, 'authUid'>;
}

export async function listStaff(tx: Tx, agencyId: string, filter: z.infer<typeof StaffFilter>) {
	return (await selectStaff(tx, agencyId, StaffFilter.parse(filter))).map(present);
}

export async function getStaff(tx: Tx, agencyId: string, id: string) {
	const row = await selectStaffMember(tx, agencyId, id);
	if (!row) throw new ServiceError('NOT_FOUND', 'Staff member not found');
	return present(row);
}

/** Archived homes can stay on someone's list but can't be newly added. */
async function checkHomes(tx: Tx, agencyId: string, homeIds: string[], current: string[] = []) {
	const homes = new Map((await listHomes(tx, agencyId)).map((h) => [h.id, h]));
	if (!homeIds.every((id) => homes.has(id)))
		throw new ServiceError('VALIDATION_FAILED', 'One of those homes is not in your agency');
	if (homeIds.some((id) => homes.get(id)!.archivedAt && !current.includes(id)))
		throw new ServiceError(
			'RULE_VIOLATION',
			'That home is archived. An admin can restore it in Setup.'
		);
}

/** Absolute URL of the app, for links in emails. */
const appUrl = () => process.env.APP_URL ?? 'http://localhost:5173';

export async function inviteStaff(tx: Tx, admin: CurrentUser, input: z.infer<typeof InviteInput>) {
	const data = InviteInput.parse(input);
	const email = data.email.trim().toLowerCase();
	await checkHomes(tx, admin.agencyId, data.homeIds);
	if (await staffByEmail(tx, admin.agencyId, email))
		throw new ServiceError('RULE_VIOLATION', 'Someone with this email is already on your staff');

	const created = await createStaffAccount(tx, admin.agencyId, { ...data, email });
	if (data.role === 'admin') await adminAdded(tx, admin.agencyId, created.id);
	return { id: created.id, email, name: data.name, role: data.role };
}

/**
 * Creates the sign-in (no password) and the profile, and emails the
 * password-setup link once the profile is committed. Callers check who may
 * do this; agency provisioning uses it for the first admin.
 */
export async function createStaffAccount(
	tx: Tx,
	agencyId: string,
	data: {
		email: string;
		name: string;
		role: 'caregiver' | 'supervisor' | 'admin';
		homeIds: string[];
		medCertified?: boolean;
	}
) {
	const email = data.email.trim().toLowerCase();
	let uid: string;
	try {
		uid = await createIdentity({ email, displayName: data.name });
	} catch (e) {
		if ((e as { code?: string }).code !== 'auth/email-already-exists') throw e;
		// The sign-in is created before the profile, outside the transaction.
		// If an earlier invite's transaction rolled back after that, the
		// sign-in was left with no profile; reuse it rather than block the
		// email for good. One that any profile uses is refused as before.
		const existing = await activeIdentityByEmail(email);
		if (!existing || (await asService(tx, (t) => signInInUse(t, existing.uid))))
			throw new ServiceError('RULE_VIOLATION', 'This email already has a Guad sign-in');
		uid = existing.uid;
	}
	let created;
	try {
		created = await insertProfile(tx, {
			agency_id: agencyId,
			auth_uid: uid,
			email,
			name: data.name,
			initials: initialsOf(data.name),
			role: data.role,
			home_ids: data.homeIds,
			med_certified: data.medCertified ?? false
		});
	} catch (e) {
		await deleteIdentity(uid).catch(() => {});
		throw e;
	}
	// The email goes out only once the profile is committed.
	afterCommit(async () => {
		const link = await passwordSetupLink(email, appUrl());
		await providers().email(email, {
			notificationId: `invite-${created.id}`,
			title: "You're invited to Guad",
			body: `You've been added to your agency's Guad workspace. Set your password here (the link expires in an hour; ask your admin for a new one if it does):\n\n${link}`,
			link: '/login'
		});
	});
	return created;
}

export async function updateStaff(
	tx: Tx,
	admin: CurrentUser,
	input: z.infer<typeof StaffUpdateInput>
) {
	const data = StaffUpdateInput.parse(input);
	const before = await selectStaffMember(tx, admin.agencyId, data.id);
	if (!before) throw new ServiceError('NOT_FOUND', 'Staff member not found');
	// An agency must never lock its last way in.
	if (
		data.id === admin.profileId &&
		((data.role !== undefined && data.role !== 'admin') || data.active === false)
	)
		throw new ServiceError('RULE_VIOLATION', "You can't remove your own admin access");
	const losesAdmin =
		before.role === 'admin' &&
		before.active &&
		((data.role !== undefined && data.role !== 'admin') || data.active === false);
	if (losesAdmin) {
		const admins = await asService(tx, (t) => lockActiveAdmins(t, admin.agencyId));
		if (admins.filter((a) => a.id !== data.id).length === 0)
			throw new ServiceError('RULE_VIOLATION', 'Keep at least one other active admin');
	}
	if (data.homeIds) await checkHomes(tx, admin.agencyId, data.homeIds, before.homeIds ?? []);
	const row = await updateProfileRow(tx, admin.agencyId, data.id, {
		role: data.role,
		home_ids: data.homeIds,
		med_certified: data.medCertified,
		active: data.active
	});
	if (!row) throw new ServiceError('NOT_FOUND', 'Staff member not found');
	if (data.role === 'admin' && before.role !== 'admin')
		await adminAdded(tx, admin.agencyId, data.id);
	if (data.active !== undefined && data.active !== before.active) {
		const uid = before.authUid;
		afterCommit(() => (data.active ? enableIdentity(uid) : disableIdentity(uid)));
	}
	// The MFA rule is checked when a session starts (/auth/session). A session
	// started under a lower role may have skipped it, so it ends now and the
	// next sign-in applies the new role's rule.
	else if (data.role !== undefined && rank(data.role) > rank(before.role)) {
		const uid = before.authUid;
		afterCommit(() => revokeSessions(uid));
	}
	return present(row);
}

/**
 * Ends the sessions of everyone in these roles after commit, for when the
 * agency starts requiring MFA for them: the rule is checked when a session
 * starts, so sessions begun without a second factor would otherwise last.
 */
export async function endSessionsForRoles(tx: Tx, agencyId: string, roles: string[]) {
	if (!roles.length) return;
	const uids = (await asService(tx, (t) => activeUidsWithRoles(t, agencyId, roles))).map(
		(r) => r.uid
	);
	afterCommit(async () => {
		for (const uid of uids) await revokeSessions(uid);
	});
}

/**
 * Lost authenticator: an admin removes the person's second factors so they
 * can enroll again at next sign-in. Audited; never on yourself, so a taken
 * admin session can't strip its own protection.
 */
export async function resetStaffMfa(tx: Tx, admin: CurrentUser, id: string, request: RequestInfo) {
	if (id === admin.profileId)
		throw new ServiceError('RULE_VIOLATION', 'Another admin has to reset your two-step sign-in');
	const before = await selectStaffMember(tx, admin.agencyId, id);
	if (!before) throw new ServiceError('NOT_FOUND', 'Staff member not found');
	await updateProfileRow(tx, admin.agencyId, id, { mfa_enabled: false });
	// audit_log takes no user writes (rls.sql): the trusted server records it.
	await asService(tx, (t) => recordMfaReset(t, admin.agencyId, admin.profileId, id, request));
	afterCommit(() => resetSecondFactors(before.authUid));
	return { id, mfaEnabled: false };
}

export async function updateOwnProfile(
	tx: Tx,
	user: CurrentUser,
	input: z.infer<typeof OwnProfileInput>
) {
	const data = OwnProfileInput.parse(input);
	const row = await updateProfileRow(tx, user.agencyId, user.profileId, {
		name: data.name,
		initials: data.name ? initialsOf(data.name) : undefined,
		phone: data.phone,
		avatar_url: data.avatarUrl
	});
	if (!row) throw new ServiceError('NOT_FOUND', 'Profile not found');
	return present(row);
}
