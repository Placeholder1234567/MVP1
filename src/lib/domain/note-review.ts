// Note review list (frontend-spec-3.md §4.2 "Filter Bar"): status filter,
// search by person or author, date range and sort. Works on the notes saved on
// the device, so the list keeps working offline.
import { normalizeSearch } from './search';

export type ReviewFilter = 'submitted' | 'all' | 'approved' | 'returned';

export interface ReviewNote {
	id: string;
	status: string | null;
	day: string | null;
	created_at: string | null;
	author_name: string | null;
	client_id: string | null;
}

export interface ReviewQuery {
	status: ReviewFilter;
	/** Words that must all appear in the person's or author's name */
	search?: string;
	/** Inclusive YYYY-MM-DD bounds on the note's day */
	from?: string;
	to?: string;
	sort?: 'newest' | 'oldest';
}

/** Signed notes only: drafts are the author's until they sign. */
const REVIEWABLE = new Set(['submitted', 'approved', 'returned']);

export function reviewList<T extends ReviewNote>(
	notes: readonly T[],
	query: ReviewQuery,
	personName: (clientId: string | null) => string
): T[] {
	const words = normalizeSearch(query.search ?? '')
		.split(' ')
		.filter(Boolean);
	const key = (n: T) => `${n.day ?? ''} ${n.created_at ?? ''}`;
	return notes
		.filter((n) => REVIEWABLE.has(n.status ?? ''))
		.filter((n) => query.status === 'all' || n.status === query.status)
		.filter((n) => !query.from || (n.day ?? '') >= query.from)
		.filter((n) => !query.to || (n.day ?? '') <= query.to)
		.filter((n) => {
			if (!words.length) return true;
			const names = normalizeSearch(`${personName(n.client_id)} ${n.author_name ?? ''}`);
			return words.every((w) => names.includes(w));
		})
		.sort((a, b) =>
			query.sort === 'oldest' ? key(a).localeCompare(key(b)) : key(b).localeCompare(key(a))
		);
}

/** Label for a note's review status (the pill on each row). */
export const reviewStatusLabel = (status: string | null) =>
	status === 'submitted'
		? 'To review'
		: status === 'approved'
			? 'Approved'
			: status === 'returned'
				? 'Sent back'
				: 'Draft';
