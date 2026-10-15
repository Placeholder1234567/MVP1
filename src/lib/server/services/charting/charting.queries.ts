import { and, eq } from 'drizzle-orm';
import type { Tx } from '../../db';
import { clients, notes } from '../../db/schema';

/** The person, if the caller can see them (RLS: their homes, or agency-wide for supervisors). */
export async function findClient(tx: Tx, agencyId: string, clientId: string) {
	const [row] = await tx
		.select({ id: clients.id, active: clients.active })
		.from(clients)
		.where(and(eq(clients.agency_id, agencyId), eq(clients.id, clientId)))
		.limit(1);
	return row ?? null;
}

export async function findNote(tx: Tx, agencyId: string, id: string) {
	const [row] = await tx
		.select({
			id: notes.id,
			authorId: notes.author_id,
			status: notes.status,
			content: notes.content
		})
		.from(notes)
		.where(and(eq(notes.agency_id, agencyId), eq(notes.id, id)))
		.limit(1);
	return row ?? null;
}

/** Inserts the note unless one with this ID exists (a retried upload). Returns true if inserted. */
export async function insertNote(tx: Tx, row: typeof notes.$inferInsert): Promise<boolean> {
	const inserted = await tx
		.insert(notes)
		.values(row)
		.onConflictDoNothing({ target: notes.id })
		.returning({ id: notes.id });
	return inserted.length > 0;
}

export async function updateNoteRow(
	tx: Tx,
	agencyId: string,
	id: string,
	set: Partial<Pick<typeof notes.$inferInsert, 'content' | 'status'>>
) {
	await tx
		.update(notes)
		.set({ ...set, updated_at: new Date() })
		.where(and(eq(notes.agency_id, agencyId), eq(notes.id, id)));
}
