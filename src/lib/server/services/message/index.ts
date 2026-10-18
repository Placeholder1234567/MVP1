// Message Service (services.md): the home message board. Append-only.
import { z } from 'zod';
import type { Tx } from '../../db';
import { ServiceError } from '../../errors';
import type { CurrentUser } from '../auth/index.ts';
import { findMessage, insertMessage, insertRead } from './message.queries';

export const NewMessage = z.object({
	id: z.uuid(),
	homeId: z.uuid(),
	body: z.string().trim().min(1, 'Write a message first').max(2000),
	/** When the caregiver pressed send, possibly offline */
	sentAt: z.coerce.date().optional()
});

/** Posts to a home's board. Idempotent by message ID (a retried upload). */
export async function sendMessage(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	input: z.input<typeof NewMessage>
): Promise<{ created: boolean }> {
	const m = NewMessage.parse(input);
	if (m.sentAt && m.sentAt.getTime() > Date.now() + 5 * 60_000) {
		throw new ServiceError('VALIDATION_FAILED', 'The message time is in the future');
	}
	const created = await insertMessage(tx, {
		id: m.id,
		agency_id: agencyId,
		home_id: m.homeId,
		from_name: user.name,
		body: m.body,
		sent_at: m.sentAt ?? new Date(),
		created_by: user.profileId
	});
	return { created };
}

export const ReadReceipt = z.object({
	id: z.uuid(),
	messageId: z.uuid(),
	/** When the board showed the message, possibly offline */
	readAt: z.coerce.date().optional()
});

/**
 * Records that the caller has seen a message (frontend-audit.md finding 19).
 * Idempotent: a second device or a retried upload is a no-op, and authors
 * don't get receipts for their own messages.
 */
export async function markRead(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	input: z.input<typeof ReadReceipt>
): Promise<{ created: boolean }> {
	const r = ReadReceipt.parse(input);
	const message = await findMessage(tx, agencyId, r.messageId);
	if (!message) throw new ServiceError('NOT_FOUND', 'Message not found');
	if (message.createdBy === user.profileId) return { created: false };
	const now = Date.now();
	const readAt = r.readAt && r.readAt.getTime() <= now + 5 * 60_000 ? r.readAt : new Date(now);
	const created = await insertRead(tx, {
		id: r.id,
		agency_id: agencyId,
		home_id: message.homeId,
		message_id: r.messageId,
		profile_id: user.profileId,
		reader_name: user.name,
		read_at: readAt
	});
	return { created };
}
