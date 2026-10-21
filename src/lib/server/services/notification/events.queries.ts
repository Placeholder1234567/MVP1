import { createHash } from 'node:crypto';
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

/** One transient failure per stored delivery/address, including concurrent SNS retries. */
export async function recordSoftBounce(
	tx: Tx,
	agencyId: string,
	email: string,
	deliveryId: string
) {
	// UUIDv5 in a dedicated namespace. Use a tuple so identity cannot collide
	// through separators in an address; neither address nor provider ID is logged.
	const bytes = createHash('sha1')
		.update(Buffer.from('529f0b6ec07b4756bf9ed266d52e4b31', 'hex'))
		.update(JSON.stringify([agencyId, deliveryId, email]))
		.digest()
		.subarray(0, 16);
	bytes[6] = (bytes[6] & 15) | 0x50;
	bytes[8] = (bytes[8] & 63) | 0x80;
	const hex = bytes.toString('hex');
	const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
	const inserted = await tx
		.insert(emailBounces)
		.values({ id, agency_id: agencyId, email })
		.onConflictDoNothing()
		.returning({ id: emailBounces.id });
	return inserted.length > 0;
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
