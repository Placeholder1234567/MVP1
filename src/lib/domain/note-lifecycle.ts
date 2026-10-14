// Note status rules. The notes_enforce_transition trigger in rls.sql enforces
// the same rules in the database; keep the two in step.

export type NoteStatus = 'draft' | 'submitted' | 'approved' | 'returned';

/** Changes the note's author may make. */
const AUTHOR: Record<NoteStatus, NoteStatus[]> = {
	draft: ['draft', 'submitted'],
	returned: ['returned', 'submitted'],
	submitted: [],
	approved: []
};

/** Changes a supervisor or admin may make to someone else's note. */
const REVIEWER: Record<NoteStatus, NoteStatus[]> = {
	draft: [],
	returned: [],
	submitted: ['approved', 'returned'],
	approved: []
};

export type TransitionCheck = { ok: true } | { ok: false; reason: string };

export function canTransition(
	from: NoteStatus,
	to: NoteStatus,
	as: 'author' | 'reviewer',
	comment?: string | null
): TransitionCheck {
	if (as === 'reviewer') {
		if (from === to) return { ok: true };
		if (!REVIEWER[from].includes(to)) return { ok: false, reason: 'Invalid note status change' };
		if (to === 'returned' && !comment?.trim()) {
			return { ok: false, reason: 'A comment is required to send a note back' };
		}
		return { ok: true };
	}
	return AUTHOR[from].includes(to)
		? { ok: true }
		: { ok: false, reason: 'Invalid note status change' };
}

/** Only drafts and returned notes can be edited by their author. */
export function isEditableByAuthor(status: NoteStatus): boolean {
	return status === 'draft' || status === 'returned';
}
