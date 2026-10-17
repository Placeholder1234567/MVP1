import { and, eq } from 'drizzle-orm';
import type { Tx } from '../../db';
import { profiles, smsInboundMessages } from '../../db/schema';

/**
 * Active staff with this phone number (E.164). Looked up across agencies,
 * because an inbound text carries only the number; each match is then
 * handled inside its own agency.
 */
export function activeProfilesByPhone(tx: Tx, phone: string) {
	return tx
		.select({
			id: profiles.id,
			agencyId: profiles.agency_id,
			authUid: profiles.auth_uid,
			role: profiles.role
		})
		.from(profiles)
		.where(and(eq(profiles.phone, phone), eq(profiles.active, true)));
}

/** Claims an inbound message ID; false if it was already handled (SNS re-delivery). */
export async function claimInbound(tx: Tx, agencyId: string, messageId: string) {
	const rows = await tx
		.insert(smsInboundMessages)
		.values({ agency_id: agencyId, message_id: messageId })
		.onConflictDoNothing()
		.returning({ id: smsInboundMessages.id });
	return rows.length > 0;
}

/** Lets SNS's retry be handled when processing failed. */
export async function releaseInbound(tx: Tx, messageId: string) {
	await tx.delete(smsInboundMessages).where(eq(smsInboundMessages.message_id, messageId));
}
