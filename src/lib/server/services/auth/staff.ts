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
import { afterCommit, type Tx } from '../../db';
import { ServiceError } from '../../errors';
import {
	createIdentity,
	deleteIdentity,
	disableIdentity,
	enableIdentity,
	passwordSetupLink
} from '../../identity.ts';
import { providers } from '../../messaging/index.ts';
import { listHomes } from '../home/index.ts';
import type { CurrentUser } from './auth.types';
import {
	insertProfile,
	selectStaff,
	selectStaffMember,
	staffByEmail,
	updateProfileRow
} from './staff.queries';

const ROLES = ['caregiver', 'supervisor', 'admin'] as const;
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

async function checkHomes(tx: Tx, agencyId: string, homeIds: string[]) {
	const known = new Set((await listHomes(tx, agencyId)).map((h) => h.id));
	if (!homeIds.every((id) => known.has(id)))
		throw new ServiceError('VALIDATION_FAILED', 'One of those homes is not in your agency');
}

/** Absolute URL of the app, for links in emails. */
const appUrl = () => process.env.APP_URL ?? 'http://localhost:5173';

export async function inviteStaff(tx: Tx, admin: CurrentUser, input: z.infer<typeof InviteInput>) {
	const data = InviteInput.parse(input);
	const email = data.email.trim().toLowerCase();
	await checkHomes(tx, admin.agencyId, data.homeIds);
	if (await staffByEmail(tx, admin.agencyId, email))
		throw new ServiceError('RULE_VIOLATION', 'Someone with this email is already on your staff');

	let uid: string;
	try {
		uid = await createIdentity({ email, displayName: data.name });
	} catch (e) {
		if ((e as { code?: string }).code === 'auth/email-already-exists')
			throw new ServiceError('RULE_VIOLATION', 'This email already has a Guad sign-in');
		throw e;
	}
	let created;
	try {
		created = await insertProfile(tx, {
			agency_id: admin.agencyId,
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
		const link = await passwordSetupLink(email, `${appUrl()}/login`);
		await providers().email(email, {
			notificationId: `invite-${created.id}`,
			title: "You're invited to Guad",
			body: `You've been added to your agency's Guad workspace. Set your password here (the link expires in an hour; ask your admin for a new one if it does):\n\n${link}`,
			link: '/login'
		});
	});
	return { id: created.id, email, name: data.name, role: data.role };
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
	if (data.homeIds) await checkHomes(tx, admin.agencyId, data.homeIds);
	const row = await updateProfileRow(tx, admin.agencyId, data.id, {
		role: data.role,
		home_ids: data.homeIds,
		med_certified: data.medCertified,
		active: data.active
	});
	if (!row) throw new ServiceError('NOT_FOUND', 'Staff member not found');
	if (data.active !== undefined && data.active !== before.active) {
		const uid = before.authUid;
		afterCommit(() => (data.active ? enableIdentity(uid) : disableIdentity(uid)));
	}
	return present(row);
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
