import { and, eq, isNull } from 'drizzle-orm';
import type { Tx } from '../../db';
import { deviceKeys } from '../../db/schema';

export async function findDeviceKey(tx: Tx, agencyId: string, profileId: string, deviceId: string) {
	const [row] = await tx
		.select({
			id: deviceKeys.id,
			ciphertext: deviceKeys.key_ciphertext,
			revokedAt: deviceKeys.revoked_at
		})
		.from(deviceKeys)
		.where(
			and(
				eq(deviceKeys.agency_id, agencyId),
				eq(deviceKeys.profile_id, profileId),
				eq(deviceKeys.device_id, deviceId)
			)
		)
		.limit(1);
	return row ?? null;
}

export async function insertDeviceKey(
	tx: Tx,
	row: { agencyId: string; profileId: string; deviceId: string; ciphertext: string }
) {
	await tx.insert(deviceKeys).values({
		agency_id: row.agencyId,
		profile_id: row.profileId,
		device_id: row.deviceId,
		key_ciphertext: row.ciphertext,
		last_issued_at: new Date()
	});
}

export async function markIssued(tx: Tx, agencyId: string, id: string) {
	await tx
		.update(deviceKeys)
		.set({ last_issued_at: new Date(), updated_at: new Date() })
		.where(and(eq(deviceKeys.agency_id, agencyId), eq(deviceKeys.id, id)));
}

export async function revokeKeys(tx: Tx, agencyId: string, profileId: string, deviceId?: string) {
	const where = [
		eq(deviceKeys.agency_id, agencyId),
		eq(deviceKeys.profile_id, profileId),
		isNull(deviceKeys.revoked_at)
	];
	if (deviceId) where.push(eq(deviceKeys.device_id, deviceId));
	const revoked = await tx
		.update(deviceKeys)
		.set({ revoked_at: new Date(), updated_at: new Date() })
		.where(and(...where))
		.returning({ id: deviceKeys.id });
	return revoked.length;
}

export async function deleteKeys(tx: Tx, agencyId: string, profileId: string) {
	const deleted = await tx
		.delete(deviceKeys)
		.where(and(eq(deviceKeys.agency_id, agencyId), eq(deviceKeys.profile_id, profileId)))
		.returning({ id: deviceKeys.id });
	return deleted.length;
}
