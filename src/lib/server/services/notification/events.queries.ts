import { and, count, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Tx } from '../../db';
import {
	deviceTokens,
	emailBounces,
	emailSuppressions,
	notificationPreferences,
	notifications,
	profiles
} from '../../db/schema';

/** The delivery a provider message ID belongs to (set by markDelivery). */
export async function deliveryByProviderId(tx: Tx, providerMessageId: string, channel: string) {
	const [row] = await tx
		.select({
			id: notifications.id,
			agencyId: notifications.agency_id,
			profileId: notifications.profile_id,
			status: notifications.status
		})
		.from(notifications)
		.where(
			and(
				eq(notifications.provider_message_id, providerMessageId),
				eq(notifications.channel, channel)
			)
		)
		.limit(1);
	return row;
}

export async function setDeliveryStatus(tx: Tx, id: string, status: 'sent' | 'failed') {
	await tx
		.update(notifications)
		.set({ status, updated_at: new Date() })
		.where(eq(notifications.id, id));
}

/** Addresses are stored and compared lowercased. */
export async function isSuppressed(tx: Tx, agencyId: string, email: string) {
	const [row] = await tx
		.select({ id: emailSuppressions.id })
		.from(emailSuppressions)
		.where(and(eq(emailSuppressions.agency_id, agencyId), eq(emailSuppressions.email, email)))
		.limit(1);
	return Boolean(row);
}

export async function suppress(tx: Tx, agencyId: string, email: string, reason: string) {
	await tx
		.insert(emailSuppressions)
		.values({ agency_id: agencyId, email, reason })
		.onConflictDoNothing();
}

/** Turns email off in every saved preference of the agency's profiles with this address. */
export async function disableEmailFor(tx: Tx, agencyId: string, email: string) {
	const owners = await tx
		.select({ id: profiles.id })
		.from(profiles)
		.where(and(eq(profiles.agency_id, agencyId), sql`lower(${profiles.email}) = ${email}`));
	if (!owners.length) return;
	await tx
		.update(notificationPreferences)
		.set({ email_enabled: false, updated_at: new Date() })
		.where(
			and(
				eq(notificationPreferences.agency_id, agencyId),
				inArray(
					notificationPreferences.profile_id,
					owners.map((o) => o.id)
				)
			)
		);
}

export async function deleteDeviceTokens(tx: Tx, profileId: string, tokens: string[]) {
	if (!tokens.length) return;
	await tx
		.delete(deviceTokens)
		.where(and(eq(deviceTokens.profile_id, profileId), inArray(deviceTokens.token, tokens)));
}

export async function recordSoftBounce(tx: Tx, agencyId: string, email: string) {
	await tx.insert(emailBounces).values({ agency_id: agencyId, email });
}

export async function softBouncesSince(tx: Tx, agencyId: string, email: string, since: Date) {
	const [row] = await tx
		.select({ n: count() })
		.from(emailBounces)
		.where(
			and(
				eq(emailBounces.agency_id, agencyId),
				eq(emailBounces.email, email),
				gte(emailBounces.created_at, since)
			)
		);
	return Number(row?.n ?? 0);
}

/** The agency's staff with this address (for the admin alert's reference). */
export async function staffWithEmail(tx: Tx, agencyId: string, email: string) {
	const [row] = await tx
		.select({ id: profiles.id })
		.from(profiles)
		.where(and(eq(profiles.agency_id, agencyId), sql`lower(${profiles.email}) = ${email}`))
		.limit(1);
	return row ?? null;
}
