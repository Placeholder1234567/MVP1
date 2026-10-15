import { describe, expect, it } from 'vitest';
import { canTransition, isEditableByAuthor } from '../../../src/lib/domain';

// Same cases as the note tests in .specify/tests/rls/03_tests.sql, so the
// domain rules and the notes_enforce_transition trigger stay in step.
describe('note transitions', () => {
	it('authors can save drafts, sign, and resubmit returned notes', () => {
		expect(canTransition('draft', 'draft', 'author').ok).toBe(true);
		expect(canTransition('draft', 'submitted', 'author').ok).toBe(true);
		expect(canTransition('returned', 'submitted', 'author').ok).toBe(true);
	});

	it('authors cannot approve their own note or reopen a submitted one', () => {
		expect(canTransition('draft', 'approved', 'author').ok).toBe(false);
		expect(canTransition('submitted', 'draft', 'author').ok).toBe(false);
		expect(canTransition('approved', 'returned', 'author').ok).toBe(false);
	});

	it('reviewers approve or send back submitted notes, with a comment to send back', () => {
		expect(canTransition('submitted', 'approved', 'reviewer').ok).toBe(true);
		expect(canTransition('submitted', 'returned', 'reviewer', 'Add the meal details')).toEqual({
			ok: true
		});
		expect(canTransition('submitted', 'returned', 'reviewer', '  ')).toEqual({
			ok: false,
			reason: 'A comment is required to send a note back'
		});
	});

	it('approved notes are final', () => {
		expect(canTransition('approved', 'returned', 'reviewer', 'x').ok).toBe(false);
		expect(canTransition('draft', 'approved', 'reviewer').ok).toBe(false);
	});

	it('only drafts and returned notes are editable by the author', () => {
		expect(
			['draft', 'submitted', 'approved', 'returned'].filter((s) => isEditableByAuthor(s as never))
		).toEqual(['draft', 'returned']);
	});
});
