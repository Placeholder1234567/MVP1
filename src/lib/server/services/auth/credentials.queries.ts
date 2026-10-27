import { and, asc, eq, sql } from 'drizzle-orm';
import type { Tx } from '../../db';
import { profiles, staffCredentials } from '../../db/schema';

const fields = {
	id: staffCredentials.id,
	profileId: staffCredentials.profile_id,
	profileName: profiles.name,
	profileActive: profiles.active,
	kind: staffCredentials.kind,
	name: staffCredentials.name,
	issuedOn: staffCredentials.issued_on,
	expiresOn: staffCredentials.expires_on,
	updatedAt: staffCredentials.updated_at
};

/** Credentials in the agency (RLS narrows a caregiver to their own), soonest expiry first. */
export function selectCredentials(tx: Tx, agencyId: string, profileId?: string) {
	return tx
		.select(fields)
		.from(staffCredentials)
		.innerJoin(profiles, eq(profiles.id, staffCredentials.profile_id))
		.where(
			and(
				eq(staffCredentials.agency_id, agencyId),
				profileId ? eq(staffCredentials.profile_id, profileId) : undefined
			)
		)
		.orderBy(
			sql`${staffCredentials.expires_on} asc nulls last`,
			asc(profiles.name),
			asc(staffCredentials.name)
		)
		.limit(2000);
}

export async function credentialOwner(tx: Tx, agencyId: string, id: string) {
	const [row] = await tx
		.select({ profileId: staffCredentials.profile_id })
		.from(staffCredentials)
		.where(and(eq(staffCredentials.agency_id, agencyId), eq(staffCredentials.id, id)))
		.for('update');
	return row ?? null;
}

export async function staffProfile(tx: Tx, agencyId: string, profileId: string) {
	const [row] = await tx
		.select({ id: profiles.id })
		.from(profiles)
		.where(and(eq(profiles.agency_id, agencyId), eq(profiles.id, profileId)));
	return row ?? null;
}

/** Another credential of this person's with the same name (any case). */
export async function sameName(
	tx: Tx,
	agencyId: string,
	profileId: string,
	name: string,
	exceptId: string | null
) {
	const [row] = await tx
		.select({ id: staffCredentials.id })
		.from(staffCredentials)
		.where(
			and(
				eq(staffCredentials.agency_id, agencyId),
				eq(staffCredentials.profile_id, profileId),
				sql`lower(${staffCredentials.name}) = lower(${name})`,
				exceptId ? sql`${staffCredentials.id} <> ${exceptId}` : undefined
			)
		);
	return row ?? null;
}

export async function insertCredential(tx: Tx, row: typeof staffCredentials.$inferInsert) {
	const [saved] = await tx
		.insert(staffCredentials)
		.values(row)
		.returning({ id: staffCredentials.id });
	return saved;
}

export async function updateCredential(
	tx: Tx,
	agencyId: string,
	id: string,
	set: Pick<
		typeof staffCredentials.$inferInsert,
		'kind' | 'name' | 'issued_on' | 'expires_on' | 'recorded_by'
	>
) {
	const [saved] = await tx
		.update(staffCredentials)
		.set({ ...set, updated_at: new Date() })
		.where(and(eq(staffCredentials.agency_id, agencyId), eq(staffCredentials.id, id)))
		.returning({ id: staffCredentials.id });
	return saved ?? null;
}

export async function deleteCredential(tx: Tx, agencyId: string, id: string) {
	const rows = await tx
		.delete(staffCredentials)
		.where(and(eq(staffCredentials.agency_id, agencyId), eq(staffCredentials.id, id)))
		.returning({ id: staffCredentials.id });
	return rows.length > 0;
}
