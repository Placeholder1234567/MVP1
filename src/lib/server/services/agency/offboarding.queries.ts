import { and, count, eq, isNull } from 'drizzle-orm';
import type { Tx } from '../../db';
import {
	agencies,
	apiKeys,
	auditLog,
	deviceKeys,
	deviceTokens,
	profiles,
	webhooks
} from '../../db/schema';

export async function lockOffboardingAgency(tx: Tx, agencyId: string) {
	const [row] = await tx
		.select({ id: agencies.id, settings: agencies.settings })
		.from(agencies)
		.where(eq(agencies.id, agencyId))
		.for('update');
	return row;
}
export function offboardingIdentities(tx: Tx, agencyId: string) {
	return tx
		.select({ id: profiles.id, uid: profiles.auth_uid })
		.from(profiles)
		.where(eq(profiles.agency_id, agencyId))
		.orderBy(profiles.id);
}
export async function offboardingCounts(tx: Tx, agencyId: string) {
	const [staff] = await tx
		.select({ total: count() })
		.from(profiles)
		.where(and(eq(profiles.agency_id, agencyId), eq(profiles.active, true)));
	const [keys] = await tx
		.select({ total: count() })
		.from(apiKeys)
		.where(and(eq(apiKeys.agency_id, agencyId), isNull(apiKeys.revoked_at)));
	const [hooks] = await tx
		.select({ total: count() })
		.from(webhooks)
		.where(and(eq(webhooks.agency_id, agencyId), eq(webhooks.active, true)));
	return { activeProfiles: staff.total, activeApiKeys: keys.total, activeWebhooks: hooks.total };
}
export async function blockAgencyAccess(tx: Tx, agencyId: string) {
	const now = new Date();
	await tx
		.update(profiles)
		.set({ active: false, updated_at: now })
		.where(eq(profiles.agency_id, agencyId));
	await tx
		.update(apiKeys)
		.set({ revoked_at: now, updated_at: now })
		.where(and(eq(apiKeys.agency_id, agencyId), isNull(apiKeys.revoked_at)));
	await tx
		.update(webhooks)
		.set({ active: false, secret_sealed: null, updated_at: now })
		.where(eq(webhooks.agency_id, agencyId));
	await tx
		.update(deviceKeys)
		.set({ revoked_at: now, key_ciphertext: '', updated_at: now })
		.where(eq(deviceKeys.agency_id, agencyId));
	await tx.delete(deviceTokens).where(eq(deviceTokens.agency_id, agencyId));
}
export async function saveOffboarding(
	tx: Tx,
	agencyId: string,
	settings: Record<string, unknown>,
	state: Record<string, unknown>,
	operator: string
) {
	await tx
		.update(agencies)
		.set({ settings: { ...settings, offboarding: state }, updated_at: new Date() })
		.where(eq(agencies.id, agencyId));
	// agencies has no audit trigger. Never alter clinical or existing audit rows.
	await tx
		.insert(auditLog)
		.values({
			agency_id: agencyId,
			table_name: 'agency_offboarding',
			record_id: agencyId,
			action: 'UPDATE',
			old_values: settings.offboarding ?? null,
			new_values: { ...state, operator }
		});
}
