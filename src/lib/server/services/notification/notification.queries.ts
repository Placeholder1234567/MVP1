import { and, arrayContains, eq } from 'drizzle-orm';
import type { Tx } from '../../db';
import { notifications, profiles } from '../../db/schema';

export async function activeStaffByRole(
	tx: Tx,
	agencyId: string,
	role: 'supervisor' | 'admin',
	homeId?: string | null
) {
	const where = [
		eq(profiles.agency_id, agencyId),
		eq(profiles.active, true),
		eq(profiles.role, role)
	];
	if (homeId) where.push(arrayContains(profiles.home_ids, [homeId]));
	return tx
		.select({ id: profiles.id })
		.from(profiles)
		.where(and(...where));
}

export async function insertNotifications(tx: Tx, rows: (typeof notifications.$inferInsert)[]) {
	if (rows.length) await tx.insert(notifications).values(rows);
}
