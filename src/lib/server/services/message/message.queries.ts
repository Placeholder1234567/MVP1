import type { Tx } from '../../db';
import { messages } from '../../db/schema';

/** Inserts unless a message with this ID exists (a retried upload). Returns true if inserted. */
export async function insertMessage(tx: Tx, row: typeof messages.$inferInsert): Promise<boolean> {
	const inserted = await tx
		.insert(messages)
		.values(row)
		.onConflictDoNothing({ target: messages.id })
		.returning({ id: messages.id });
	return inserted.length > 0;
}
