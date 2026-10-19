import { and, arrayOverlaps, asc, eq } from 'drizzle-orm';
import type { Tx } from '../../db';
import type { RequestInfo } from '../../db';
import { auditLog, profiles } from '../../db/schema';

const columns = {
	id: profiles.id,
	name: profiles.name,
	email: profiles.email,
	phone: profiles.phone,
	initials: profiles.initials,
	role: profiles.role,
	homeIds: profiles.home_ids,
	medCertified: profiles.med_certified,
	mfaEnabled: profiles.mfa_enabled,
	active: profiles.active,
	authUid: profiles.auth_uid,
	createdAt: profiles.created_at,
	lastSignInAt: profiles.last_sign_in_at
};

// Runs as app_user: profiles_select limits what each role can see.
export function selectStaff(
	tx: Tx,
	agencyId: string,
	filter: { homeId?: string; role?: 'caregiver' | 'supervisor' | 'admin'; active?: boolean }
) {
	const where = [eq(profiles.agency_id, agencyId)];
	if (filter.homeId) where.push(arrayOverlaps(profiles.home_ids, [filter.homeId]));
	if (filter.role) where.push(eq(profiles.role, filter.role));
	if (filter.active !== undefined) where.push(eq(profiles.active, filter.active));
	return tx
		.select(columns)
		.from(profiles)
		.where(and(...where))
		.orderBy(asc(profiles.name));
}

export async function selectStaffMember(tx: Tx, agencyId: string, id: string) {
	const [row] = await tx
		.select(columns)
		.from(profiles)
		.where(and(eq(profiles.agency_id, agencyId), eq(profiles.id, id)))
		.limit(1);
	return row ?? null;
}

export async function staffByEmail(tx: Tx, agencyId: string, email: string) {
	const [row] = await tx
		.select({ id: profiles.id })
		.from(profiles)
		.where(and(eq(profiles.agency_id, agencyId), eq(profiles.email, email)))
		.limit(1);
	return row ?? null;
}

/** An admin action that the row trigger can't describe (security.md "Audit Trail"). */
export async function recordMfaReset(
	tx: Tx,
	agencyId: string,
	adminId: string,
	profileId: string,
	request: RequestInfo
) {
	await tx.insert(auditLog).values({
		agency_id: agencyId,
		table_name: 'mfa_resets',
		record_id: profileId,
		action: 'UPDATE',
		performed_by: adminId,
		ip_address: request.ip,
		user_agent: request.user_agent,
		new_values: { second_factors: 'removed' }
	});
}

export async function insertProfile(tx: Tx, row: typeof profiles.$inferInsert) {
	const [created] = await tx.insert(profiles).values(row).returning({ id: profiles.id });
	return created;
}

export async function updateProfileRow(
	tx: Tx,
	agencyId: string,
	id: string,
	set: Partial<typeof profiles.$inferInsert>
) {
	const [row] = await tx
		.update(profiles)
		.set({ ...set, updated_at: new Date() })
		.where(and(eq(profiles.agency_id, agencyId), eq(profiles.id, id)))
		.returning(columns);
	return row ?? null;
}

/**
 * Whether any profile, in any agency, uses this sign-in. Only for telling an
 * orphaned sign-in (left by an invite whose transaction rolled back) from a
 * real one; nothing about the other profile is returned.
 */
export async function signInInUse(tx: Tx, authUid: string) {
	const [row] = await tx
		.select({ id: profiles.id })
		.from(profiles)
		.where(eq(profiles.auth_uid, authUid))
		.limit(1);
	return !!row;
}
