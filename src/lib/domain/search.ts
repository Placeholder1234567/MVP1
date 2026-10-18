// Search for the command palette (frontend-spec-3.md §7.4). Runs on the
// device over the synced local records, so it works offline and the query
// never leaves the device. Matching ignores case and accents, every word must
// appear, and results whose title starts with the query rank first.

export type SearchKind = 'page' | 'person' | 'staff' | 'note' | 'medication' | 'incident' | 'goal';

export interface SearchItem {
	kind: SearchKind;
	id: string;
	title: string;
	detail: string;
	href: string;
	/** Extra searchable text beyond the title and detail (note content, home name). */
	text?: string;
}

export interface SearchGroup {
	kind: SearchKind;
	items: SearchItem[];
	/** Matches not shown, so people know to refine the search. */
	more: number;
}

export const SEARCH_LABELS: Record<SearchKind, string> = {
	page: 'Go to',
	person: 'People',
	staff: 'Staff',
	note: 'Notes',
	medication: 'Medications',
	incident: 'Incidents',
	goal: 'Goals'
};

/** Category order by role (the spec's priority columns); pages always first. */
export const SEARCH_ORDER: Record<'caregiver' | 'manager', SearchKind[]> = {
	caregiver: ['page', 'person', 'medication', 'note', 'staff', 'incident', 'goal'],
	manager: ['page', 'note', 'incident', 'person', 'staff', 'medication', 'goal']
};

export const normalizeSearch = (s: string) =>
	s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function searchItems(
	items: SearchItem[],
	query: string,
	order: SearchKind[],
	perKind = 3
): SearchGroup[] {
	const q = normalizeSearch(query);
	if (!q) return [];
	const words = q.split(' ');
	const groups = new Map<SearchKind, { item: SearchItem; rank: number }[]>();
	for (const item of items) {
		const title = normalizeSearch(item.title);
		const all = `${title} ${normalizeSearch(item.detail)} ${normalizeSearch(item.text ?? '')}`;
		if (!words.every((w) => all.includes(w))) continue;
		const rank = title.startsWith(q) ? 0 : title.includes(q) ? 1 : 2;
		const list = groups.get(item.kind) ?? [];
		list.push({ item, rank });
		groups.set(item.kind, list);
	}
	return order.flatMap((kind) => {
		const list = groups.get(kind);
		if (!list?.length) return [];
		list.sort((a, b) => a.rank - b.rank || a.item.title.localeCompare(b.item.title));
		return [
			{
				kind,
				items: list.slice(0, perKind).map((r) => r.item),
				more: Math.max(0, list.length - perKind)
			}
		];
	});
}
