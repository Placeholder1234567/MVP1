import { and, eq } from 'drizzle-orm';
import type { Tx } from '../../db';
import { messageReads, messages } from '../../db/schema';

/** Inserts unless a message with this ID exists (a retried upload). Returns true if inserted. */
export async function insertMessage(tx: Tx, row: typeof messages.$inferInsert): Promise<boolean> {
	const inserted = await tx
		.insert(messages)
		.values(row)
		.onConflictDoNothing({ target: messages.id })
		.returning({ id: messages.id });
	return inserted.length > 0;
}

/** The message's board and author, if the caller can see it. */
export async function findMessage(tx: Tx, agencyId: string, id: string) {
	const [row] = await tx
		.select({ homeId: messages.home_id, createdBy: messages.created_by })
		.from(messages)
		.where(and(eq(messages.agency_id, agencyId), eq(messages.id, id)));
	return row;
}

/** Inserts a read receipt unless this reader already has one (another device) or the ID exists. */
export async function insertRead(tx: Tx, row: typeof messageReads.$inferInsert): Promise<boolean> {
	const inserted = await tx
		.insert(messageReads)
		.values(row)
		.onConflictDoNothing()
		.returning({ id: messageReads.id });
	return inserted.length > 0;
}
