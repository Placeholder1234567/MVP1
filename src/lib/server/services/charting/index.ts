// Charting Service (services.md): shift and behavior notes. Online tRPC
// procedures and sync.upload both call these functions, so offline writes get
// the same rules. The notes_enforce_transition trigger is the backstop.
import { z } from 'zod';
import {
	addDays,
	canTransition,
	isEditableByAuthor,
	localTime,
	type NoteStatus
} from '../../../domain/index.ts';
import type { Tx } from '../../db';
import { ServiceError } from '../../errors';
import type { CurrentUser } from '../auth/index.ts';
import { findClient, findNote, insertNote, updateNoteRow } from './charting.queries';

/** Note content is a JSON object of sections; devices may send it as JSON text. */
const Content = z.preprocess(
	(v) => (typeof v === 'string' ? JSON.parse(v) : v),
	z.record(z.string(), z.unknown())
);

export const NewNote = z.object({
	id: z.uuid(),
	clientId: z.uuid(),
	day: z.iso.date(),
	shift: z.enum(['am', 'pm', 'on']),
	type: z.enum(['shift', 'behavior']),
	content: Content.default({}),
	lomiDrafted: z.boolean().default(false),
	/** A note created and signed while offline arrives as one write. */
	status: z.enum(['draft', 'submitted']).default('draft')
});

export const NoteChanges = z
	.object({ content: Content.optional(), status: z.enum(['draft', 'submitted']).optional() })
	.refine((v) => v.content !== undefined || v.status !== undefined, 'Nothing to change');

/** Notes may be written for the last 30 days (the device sync window) and up to tomorrow. */
function checkDay(day: string, timeZone: string) {
	const today = localTime(new Date(), timeZone).day;
	if (day > addDays(today, 1) || day < addDays(today, -30)) {
		throw new ServiceError('VALIDATION_FAILED', 'Notes can only be written for the last 30 days');
	}
}

/**
 * Creates a note authored by the caller. Idempotent: a note that already
 * exists with this ID (a retried upload) is left as it is.
 */
export async function createNote(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	input: z.input<typeof NewNote>
): Promise<{ created: boolean }> {
	const note = NewNote.parse(input);
	checkDay(note.day, user.timeZone);
	if (!(await findClient(tx, agencyId, note.clientId))) {
		throw new ServiceError('NOT_FOUND', 'That person is not in your homes');
	}
	const created = await insertNote(tx, {
		id: note.id,
		agency_id: agencyId,
		client_id: note.clientId,
		author_id: user.profileId,
		author_name: user.name,
		created_by: user.profileId,
		day: note.day,
		shift: note.shift,
		type: note.type,
		content: note.content,
		lomi_drafted: note.lomiDrafted,
		status: 'draft'
	});
	if (created && note.status === 'submitted') {
		await updateNoteRow(tx, agencyId, note.id, { status: 'submitted' });
	}
	return { created };
}

export interface UpdateOptions {
	/**
	 * The change was queued offline. If a supervisor sent the note back in the
	 * meantime, a queued "sign" is refused: the author hasn't seen the comment.
	 */
	fromOfflineQueue?: boolean;
}

/** Edits or signs the caller's own note. Reviewing others' notes is note.approve / sendBack. */
export async function updateNote(
	tx: Tx,
	agencyId: string,
	user: CurrentUser,
	id: string,
	changes: z.input<typeof NoteChanges>,
	options: UpdateOptions = {}
): Promise<void> {
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
	await updateNoteRow(tx, agencyId, id, { content: set.content, status: set.status });
}
