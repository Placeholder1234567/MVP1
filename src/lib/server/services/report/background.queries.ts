import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import type { Tx } from '../../db';
import { clients, profiles, reportJobs } from '../../db/schema';
import type { CurrentUser } from '../auth';

type Owner = Pick<CurrentUser, 'agencyId' | 'profileId'>;
const owned = (user: Owner, id: string) =>
	and(
		eq(reportJobs.id, id),
		eq(reportJobs.agency_id, user.agencyId),
		eq(reportJobs.requested_by, user.profileId)
	);
export async function ownReport(tx: Tx, user: CurrentUser, id: string) {
	return (await tx.select().from(reportJobs).where(owned(user, id)).limit(1))[0] ?? null;
}
export function recentCareReports(tx: Tx, user: CurrentUser) {
	return tx
		.select()
		.from(reportJobs)
		.where(
			and(eq(reportJobs.agency_id, user.agencyId), eq(reportJobs.requested_by, user.profileId))
		)
		.orderBy(desc(reportJobs.created_at), desc(reportJobs.id))
		.limit(50);
}
export async function insertCareReport(tx: Tx, data: typeof reportJobs.$inferInsert) {
	return (await tx.insert(reportJobs).values(data).returning())[0];
}
/** Background worker only: loading the owner is necessary before constructing RLS claims. */
export async function queuedCareReport(tx: Tx, id: string) {
	return (await tx.select().from(reportJobs).where(eq(reportJobs.id, id)).limit(1))[0] ?? null;
}
export async function requesterUid(tx: Tx, agencyId: string, profileId: string) {
	return (
		await tx
			.select({ uid: profiles.auth_uid })
			.from(profiles)
			.where(
				and(eq(profiles.agency_id, agencyId), eq(profiles.id, profileId), eq(profiles.active, true))
			)
			.limit(1)
	)[0]?.uid;
}
export async function claimCareReport(tx: Tx, user: CurrentUser, id: string, now: Date) {
	return (
		(
			await tx
				.update(reportJobs)
				.set({ status: 'processing', updated_at: now })
				.where(
					and(owned(user, id), eq(reportJobs.status, 'queued'), gt(reportJobs.expires_at, now))
				)
				.returning()
		)[0] ?? null
	);
}
export async function updateCareReport(
	tx: Tx,
	user: Owner,
	id: string,
	values: Partial<
		Pick<
			typeof reportJobs.$inferInsert,
			'status' | 'params' | 'ready_at' | 'expires_at' | 'error' | 'storage_path'
		>
	>
) {
	await tx
		.update(reportJobs)
		.set({ ...values, updated_at: new Date() })
		.where(owned(user, id));
}
export async function visibleReportClients(
	tx: Tx,
	user: CurrentUser,
	homeId: string,
	ids: string[]
) {
	if (!ids.length) return true;
	const rows = await tx
		.select({ id: clients.id })
		.from(clients)
		.where(
			and(
				eq(clients.agency_id, user.agencyId),
				eq(clients.home_id, homeId),
				inArray(clients.id, ids)
			)
		);
	return rows.length === ids.length;
}

/** Publication cannot revive a job whose deadline or storage pointer changed during I/O. */
export async function publishCareReport(
	tx: Tx,
	user: CurrentUser,
	id: string,
	path: string,
	params: typeof reportJobs.$inferInsert.params,
	/** How long the ready file stays downloadable */
	keepMs = 24 * 3600000
) {
	const now = new Date();
	return (
		(
			await tx
				.update(reportJobs)
				.set({
					status: 'ready',
					params,
					ready_at: now,
					expires_at: new Date(now.getTime() + keepMs),
					error: null,
					updated_at: now
				})
				.where(
					and(
						owned(user, id),
						eq(reportJobs.status, 'processing'),
						eq(reportJobs.storage_path, path),
						gt(reportJobs.expires_at, now)
					)
				)
				.returning()
		)[0] ?? null
	);
}
