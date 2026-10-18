import { describe, expect, it } from 'vitest';
import {
	reviewList,
	reviewStatusLabel,
	type ReviewNote
} from '../../../src/lib/domain/note-review';

const n = (
	id: string,
	status: string,
	day: string,
	author: string,
	client: string
): ReviewNote => ({
	id,
	status,
	day,
	created_at: `${day}T10:00:00Z`,
	author_name: author,
	client_id: client
});
const notes = [
	n('a', 'submitted', '2026-10-15', 'Cara Giver', 'rosa'),
	n('b', 'approved', '2026-10-16', 'Dev Okafor', 'marcus'),
	n('c', 'returned', '2026-10-14', 'Cara Giver', 'marcus'),
	n('d', 'draft', '2026-10-17', 'Cara Giver', 'rosa'),
	n('e', 'submitted', '2026-10-17', 'Lena Park', 'josé')
];
const names: Record<string, string> = {
	rosa: 'Rosa Demo',
	marcus: 'Marcus Demo',
	josé: 'José Demo'
};
const name = (id: string | null) => names[id ?? ''] ?? '';
const ids = (q: Parameters<typeof reviewList>[1]) => reviewList(notes, q, name).map((x) => x.id);

describe('reviewList', () => {
	it('shows notes to review by default, newest first, and never drafts', () => {
		expect(ids({ status: 'submitted' })).toEqual(['e', 'a']);
		expect(ids({ status: 'all' })).toEqual(['e', 'b', 'a', 'c']);
	});
	it('filters by approved or sent back', () => {
		expect(ids({ status: 'approved' })).toEqual(['b']);
		expect(ids({ status: 'returned' })).toEqual(['c']);
	});
	it('searches the person and author names, ignoring case and accents', () => {
		expect(ids({ status: 'all', search: 'marcus' })).toEqual(['b', 'c']);
		expect(ids({ status: 'all', search: 'cara marcus' })).toEqual(['c']);
		expect(ids({ status: 'all', search: 'jose' })).toEqual(['e']);
		expect(ids({ status: 'all', search: 'nobody' })).toEqual([]);
	});
	it('limits to a date range and sorts oldest first on request', () => {
		expect(ids({ status: 'all', from: '2026-10-15', to: '2026-10-16' })).toEqual(['b', 'a']);
		expect(ids({ status: 'all', sort: 'oldest' })).toEqual(['c', 'a', 'b', 'e']);
	});
	it('labels each status', () => {
		expect(['submitted', 'approved', 'returned', 'draft'].map(reviewStatusLabel)).toEqual([
			'To review',
			'Approved',
			'Sent back',
			'Draft'
		]);
	});
});
