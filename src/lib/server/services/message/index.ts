// Message Service (services.md): the home message board. Append-only.
import { z } from 'zod';
import type { Tx } from '../../db';
import { ServiceError } from '../../errors';
import type { CurrentUser } from '../auth/index.ts';
import { insertMessage } from './message.queries';

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
