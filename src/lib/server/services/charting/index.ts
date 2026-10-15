// Charting Service (services.md): shift and behavior notes with their goal
// trials. Online tRPC procedures and sync.upload both call these functions, so
// offline writes get the same rules. The notes_enforce_transition trigger is
// the backstop, and the notes_write_history trigger writes note_history.
import { z } from 'zod';
import {
	addDays,
	canTransition,
	isEditableByAuthor,
	isPromptLevel,
	localTime,
	shiftAt,
	type NoteStatus
} from '../../../domain/index.ts';
import type { Tx } from '../../db';
import { ServiceError } from '../../errors';
import type { CurrentUser } from '../auth/index.ts';
import {
	findClient,
	findNote,
	findNoteGoal,
	insertNote,
	insertNoteGoal,
	selectClientGoals,
	selectNoteGoals,
	selectNoteHistory,
	selectNotes,
	updateNoteGoal,
	updateNoteRow,
	type NoteFilter
} from './charting.queries';

/** Note content is a JSON object of sections; devices may send it as JSON text. */
const Content = z.preprocess(
	(v) => (typeof v === 'string' ? JSON.parse(v) : v),
	z.record(z.string(), z.unknown())
);

/** Goal data on a note: prompt levels for each attempt, or why it wasn't attempted. */
export const GoalEntry = z
	.object({
		goalId: z.uuid(),
		trials: z.array(z.string().refine(isPromptLevel, 'Unknown prompt level')).max(20).default([]),
		notAttempted: z.boolean().default(false),
		reason: z.string().trim().max(500).nullish()
	})
	.refine((g) => !g.notAttempted || !!g.reason, 'Say why the goal was not attempted');

export const NewNote = z.object({
	id: z.uuid(),
	clientId: z.uuid(),
	/** Start date of the shift the note covers; defaults to the caller's current shift */
	day: z.iso.date().optional(),
	shift: z.enum(['am', 'pm', 'on']).optional(),
	type: z.enum(['shift', 'behavior']),
	content: Content.default({}),
	goals: z.array(GoalEntry).max(30).default([]),
	lomiDrafted: z.boolean().default(false),
	/** A note created and signed while offline arrives as one write. */
	status: z.enum(['draft', 'submitted']).default('draft')
});

export const NoteChanges = z
	.object({
		lomiDrafted: z.literal(true).optional(),
		content: Content.optional(),
		goals: z.array(GoalEntry).max(30).optional(),
		status: z.enum(['draft', 'submitted']).optional()
	})
	.refine(
		(v) =>
			v.content !== undefined ||
			v.status !== undefined ||
			v.goals !== undefined ||
			v.lomiDrafted !== undefined,
		'Nothing to change'
	);

/** Notes may be written for the last 30 days (the device sync window) and up to tomorrow. */
function checkDay(day: string, timeZone: string) {
	const today = localTime(new Date(), timeZone).day;
	if (day > addDays(today, 1) || day < addDays(today, -30)) {
		throw new ServiceError('VALIDATION_FAILED', 'Notes can only be written for the last 30 days');
	}
}

/** Writes goal trials onto a note; each goal must belong to the note's person. */
async function saveGoals(
	tx: Tx,
	agencyId: string,
	noteId: string,
	clientId: string,
	entries: z.infer<typeof GoalEntry>[]
) {
	if (!entries.length) return;
	const allowed = new Set((await selectClientGoals(tx, agencyId, clientId)).map((g) => g.id));
	for (const g of entries) {
		if (!allowed.has(g.goalId)) {
			throw new ServiceError('VALIDATION_FAILED', 'That goal is not one of this person’s goals');
		}
		const set = {
			trials: g.notAttempted ? [] : g.trials,
			not_attempted: g.notAttempted,
			reason: g.reason ?? null
		};
		const existing = await findNoteGoal(tx, agencyId, noteId, g.goalId);
		if (existing) await updateNoteGoal(tx, existing.id, set);
		else
			await insertNoteGoal(tx, { agency_id: agencyId, note_id: noteId, goal_id: g.goalId, ...set });
	}
}

/**
 * Creates a note authored by the caller, with its goal trials, in one
 * transaction. Idempotent: a note that already exists with this ID (a
 * retried upload) is left as it is.
 */
export async function createNote(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	input: z.input<typeof NewNote>
): Promise<{ id: string; created: boolean }> {
	const note = NewNote.parse(input);
	const current = shiftAt(new Date(), user.timeZone);
	const day = note.day ?? current.day;
	const shift = note.shift ?? current.shift;
	checkDay(day, user.timeZone);
	const client = await findClient(tx, agencyId, note.clientId);
	if (!client) throw new ServiceError('NOT_FOUND', 'That person is not in your homes');
	const created = await insertNote(tx, {
		id: note.id,
		agency_id: agencyId,
		client_id: note.clientId,
		author_id: user.profileId,
		author_name: user.name,
		created_by: user.profileId,
		day,
		shift,
		type: note.type,
		content: note.content,
		lomi_drafted: note.lomiDrafted,
		status: 'draft'
	});
	if (!created) return { id: note.id, created };
	await saveGoals(tx, agencyId, note.id, note.clientId, note.goals);
	if (note.status === 'submitted')
		await updateNoteRow(tx, agencyId, note.id, { status: 'submitted' });
	return { id: note.id, created };
}

export interface UpdateOptions {
	/**
	 * The change was queued offline. If a supervisor sent the note back in the
	 * meantime, a queued "sign" is refused: the author hasn't seen the comment.
	 */
	fromOfflineQueue?: boolean;
}

/** Edits, adds goal data to, or signs the caller's own note. */
export async function updateNote(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	id: string,
	changes: z.input<typeof NoteChanges>,
	options: UpdateOptions = {}
): Promise<{ updatedAt: Date | null }> {
	const set = NoteChanges.parse(changes);
	const note = await findNote(tx, agencyId, id);
	if (!note) throw new ServiceError('NOT_FOUND', 'Note not found');
	if (note.authorId !== user.profileId) {
		throw new ServiceError('FORBIDDEN', 'Only the author can edit or sign this note');
	}
	const from = note.status as NoteStatus;
	if (!isEditableByAuthor(from)) {
		throw new ServiceError(
			'RULE_VIOLATION',
			from === 'approved' ? 'This note was already approved' : 'This note was already signed'
		);
	}
	if (options.fromOfflineQueue && from === 'returned' && set.status === 'submitted') {
		throw new ServiceError(
			'RULE_VIOLATION',
			'Your supervisor sent this note back. Read their comment and sign it again.'
		);
	}
	const to = set.status ?? from;
	const check = canTransition(from, to, 'author');
	if (!check.ok) throw new ServiceError('RULE_VIOLATION', check.reason);
	if (set.goals) await saveGoals(tx, agencyId, id, note.clientId, set.goals);
	const updatedAt = await updateNoteRow(tx, agencyId, id, {
		content: set.content,
		lomi_drafted: set.lomiDrafted,
		status: set.status
	});
	return { updatedAt };
}

/** The human-signature step: draft or returned -> submitted (note.sign). */
export function signNote(tx: Tx, agencyId: string, user: CurrentUser, id: string) {
	return updateNote(tx, agencyId, user, id, { status: 'submitted' });
}

async function review(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	id: string,
	to: 'approved' | 'returned',
	comment?: string
) {
	if (user.role === 'caregiver') {
		throw new ServiceError('FORBIDDEN', 'Only supervisors can review notes');
	}
	const note = await findNote(tx, agencyId, id);
	if (!note) throw new ServiceError('NOT_FOUND', 'Note not found');
	if (note.authorId === user.profileId) {
		throw new ServiceError('RULE_VIOLATION', 'You can’t review your own note');
	}
	const check = canTransition(note.status as NoteStatus, to, 'reviewer', comment);
	if (!check.ok) throw new ServiceError('RULE_VIOLATION', check.reason);
	const updatedAt = await updateNoteRow(tx, agencyId, id, {
		status: to,
		...(to === 'returned' ? { supervisor_comment: comment!.trim() } : {})
	});
	return { updatedAt };
}

export function approveNote(tx: Tx, agencyId: string, user: CurrentUser, id: string) {
	return review(tx, agencyId, user, id, 'approved');
}

export function sendBackNote(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	id: string,
	comment: string
) {
	return review(tx, agencyId, user, id, 'returned', comment);
}

/** A note with its goal data and history (note.get). */
export async function getNote(tx: Tx, agencyId: string, id: string) {
	const note = await findNote(tx, agencyId, id);
	if (!note) return null;
	const [goals, history] = await Promise.all([
		selectNoteGoals(tx, agencyId, id),
		selectNoteHistory(tx, agencyId, id)
	]);
	return {
		...note,
		goals: goals.map((g) => ({ ...g, trials: g.trials ?? [] })),
		history
	};
}

export function listNotes(tx: Tx, agencyId: string, filter: NoteFilter) {
	return selectNotes(tx, agencyId, filter);
}

/** The person, if the caller can see them. Shared with other care-record services. */
export function findVisibleClient(tx: Tx, agencyId: string, clientId: string) {
	return findClient(tx, agencyId, clientId);
}
