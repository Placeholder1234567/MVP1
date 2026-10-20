import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { Tx } from '../../db';
import { notificationPreferences, profiles, smsCarrierConsents } from '../../db/schema';

const phoneHash = (phone: string) => createHash('sha256').update(phone).digest('hex');
export async function carrierPhone(tx: Tx, agencyId: string, profileId: string) {
	const [row] = await tx
		.select({ phone: profiles.phone })
		.from(profiles)
		.where(and(eq(profiles.agency_id, agencyId), eq(profiles.id, profileId)));
	return row?.phone;
}
async function carrierState(tx: Tx, agencyId: string, phone: string) {
	const [row] = await tx
		.select({ state: smsCarrierConsents.state })
		.from(smsCarrierConsents)
		.where(
			and(
				eq(smsCarrierConsents.agency_id, agencyId),
				eq(smsCarrierConsents.phone_hash, phoneHash(phone))
			)
		);
	return row?.state;
}
/** Preserve ambiguous legacy SMS-off choices before ordinary preferences change. */
export async function ensureCarrierState(tx: Tx, agencyId: string, phone: string) {
	const existing = await carrierState(tx, agencyId, phone);
	if (existing) return existing;
	const legacy = await tx
		.select({ id: notificationPreferences.id })
		.from(notificationPreferences)
		.innerJoin(profiles, eq(profiles.id, notificationPreferences.profile_id))
		.where(
			and(
				eq(profiles.agency_id, agencyId),
				eq(profiles.phone, phone),
				eq(notificationPreferences.agency_id, agencyId),
				eq(notificationPreferences.sms_enabled, false)
			)
		)
		.limit(1);
	await tx
		.insert(smsCarrierConsents)
		.values({
			agency_id: agencyId,
			phone_hash: phoneHash(phone),
			state: legacy.length ? 'legacy_suppressed' : 'unknown'
		})
		.onConflictDoNothing();
	return (await carrierState(tx, agencyId, phone))!;
}
export async function carrierOptOut(tx: Tx, agencyId: string, phone: string) {
	const state = await ensureCarrierState(tx, agencyId, phone);
	return state === 'stopped' || state === 'legacy_suppressed';
}
export async function recordCarrierConsent(
	tx: Tx,
	agencyId: string,
	phone: string,
	optedOut: boolean
) {
	await tx
		.insert(smsCarrierConsents)
		.values({
			agency_id: agencyId,
			phone_hash: phoneHash(phone),
			state: optedOut ? 'stopped' : 'started'
		})
		.onConflictDoUpdate({
			target: [smsCarrierConsents.agency_id, smsCarrierConsents.phone_hash],
			set: { state: optedOut ? 'stopped' : 'started', updated_at: new Date() }
		});
}
