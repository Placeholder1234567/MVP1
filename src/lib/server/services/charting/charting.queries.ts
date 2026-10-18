import { and, asc, desc, eq, type SQL } from 'drizzle-orm';
import type { Tx } from '../../db';
import { clients, goals, noteGoals, noteHistory, notes } from '../../db/schema';

/** The person, if the caller can see them (RLS: their homes, or agency-wide for supervisors). */
export async function findClient(tx: Tx, agencyId: string, clientId: string) {
	const [row] = await tx
		.select({ id: clients.id, active: clients.active, homeId: clients.home_id })
		.from(clients)
		.where(and(eq(clients.agency_id, agencyId), eq(clients.id, clientId)))
		.limit(1);
	return row ?? null;
}

const noteColumns = {
	id: notes.id,
	clientId: notes.client_id,
	homeId: notes.home_id,
	authorId: notes.author_id,
	authorName: notes.author_name,
	day: notes.day,
	shift: notes.shift,
	type: notes.type,
	content: notes.content,
	status: notes.status,
	supervisorComment: notes.supervisor_comment,
	lomiDrafted: notes.lomi_drafted,
	createdAt: notes.created_at,
	updatedAt: notes.updated_at
};

export async function findNote(tx: Tx, agencyId: string, id: string) {
	const [row] = await tx
		.select(noteColumns)
		.from(notes)
		.where(and(eq(notes.agency_id, agencyId), eq(notes.id, id)))
		.limit(1);
	return row ?? null;
}

export interface NoteFilter {
	homeId?: string;
	clientId?: string;
	day?: string;
	shift?: 'am' | 'pm' | 'on';
	status?: 'draft' | 'submitted' | 'approved' | 'returned';
	authorId?: string;
	limit: number;
	offset: number;
}

export function selectNotes(tx: Tx, agencyId: string, f: NoteFilter) {
	const where: SQL[] = [eq(notes.agency_id, agencyId)];
	if (f.homeId) where.push(eq(notes.home_id, f.homeId));
	if (f.clientId) where.push(eq(notes.client_id, f.clientId));
	if (f.day) where.push(eq(notes.day, f.day));
	if (f.shift) where.push(eq(notes.shift, f.shift));
	if (f.status) where.push(eq(notes.status, f.status));
	if (f.authorId) where.push(eq(notes.author_id, f.authorId));
	return tx
		.select({
			id: notes.id,
			clientId: notes.client_id,
			clientName: clients.name,
			authorName: notes.author_name,
			day: notes.day,
			shift: notes.shift,
			type: notes.type,
			status: notes.status,
			lomiDrafted: notes.lomi_drafted,
			createdAt: notes.created_at
		})
		.from(notes)
		.innerJoin(clients, eq(clients.id, notes.client_id))
		.where(and(...where))
		.orderBy(desc(notes.day), desc(notes.created_at))
		.limit(f.limit)
		.offset(f.offset);
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
	set: Partial<
		Pick<typeof notes.$inferInsert, 'content' | 'status' | 'supervisor_comment' | 'lomi_drafted'>
	>
) {
	const [row] = await tx
		.update(notes)
		.set({ ...set, updated_at: new Date() })
		.where(and(eq(notes.agency_id, agencyId), eq(notes.id, id)))
		.returning({ updatedAt: notes.updated_at });
	return row?.updatedAt ?? null;
}

/** Goals of a person the caller can see, by ID. */
export function selectClientGoals(tx: Tx, agencyId: string, clientId: string) {
	return tx
		.select({ id: goals.id })
		.from(goals)
		.where(and(eq(goals.agency_id, agencyId), eq(goals.client_id, clientId)));
}

export function selectNoteGoals(tx: Tx, agencyId: string, noteId: string) {
	return tx
		.select({
			id: noteGoals.id,
			goalId: noteGoals.goal_id,
			goalText: goals.text,
			trials: noteGoals.trials,
			notAttempted: noteGoals.not_attempted,
			reason: noteGoals.reason
		})
		.from(noteGoals)
		.innerJoin(goals, eq(goals.id, noteGoals.goal_id))
		.where(and(eq(noteGoals.agency_id, agencyId), eq(noteGoals.note_id, noteId)));
}

export async function findNoteGoal(tx: Tx, agencyId: string, noteId: string, goalId: string) {
	const [row] = await tx
		.select({ id: noteGoals.id })
		.from(noteGoals)
		.where(
			and(
				eq(noteGoals.agency_id, agencyId),
				eq(noteGoals.note_id, noteId),
				eq(noteGoals.goal_id, goalId)
			)
		)
		.limit(1);
	return row ?? null;
}

/** A goal-trial row by its own ID, for edits queued on a device. */
export async function findNoteGoalById(tx: Tx, agencyId: string, id: string) {
	const [row] = await tx
		.select({
			noteId: noteGoals.note_id,
			goalId: noteGoals.goal_id,
			trials: noteGoals.trials,
			notAttempted: noteGoals.not_attempted,
			reason: noteGoals.reason
		})
		.from(noteGoals)
		.where(and(eq(noteGoals.agency_id, agencyId), eq(noteGoals.id, id)))
		.limit(1);
	return row ?? null;
}

export async function insertNoteGoal(tx: Tx, row: typeof noteGoals.$inferInsert) {
	await tx.insert(noteGoals).values(row).onConflictDoNothing({ target: noteGoals.id });
}

export async function updateNoteGoal(
	tx: Tx,
	agencyId: string,
	id: string,
	set: Pick<typeof noteGoals.$inferInsert, 'trials' | 'not_attempted' | 'reason'>
) {
	await tx
		.update(noteGoals)
		.set({ ...set, updated_at: new Date() })
		.where(and(eq(noteGoals.agency_id, agencyId), eq(noteGoals.id, id)));
}

export function selectNoteHistory(tx: Tx, agencyId: string, noteId: string) {
	return tx
		.select({
			action: noteHistory.action,
			byName: noteHistory.by_name,
			occurredAt: noteHistory.occurred_at
		})
		.from(noteHistory)
		.where(and(eq(noteHistory.agency_id, agencyId), eq(noteHistory.note_id, noteId)))
		.orderBy(asc(noteHistory.occurred_at));
}
