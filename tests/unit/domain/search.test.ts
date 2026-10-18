import { describe, expect, it } from 'vitest';
import {
	normalizeSearch,
	SEARCH_ORDER,
	searchItems,
	type SearchItem
} from '../../../src/lib/domain/search';

const item = (kind: SearchItem['kind'], title: string, extra: Partial<SearchItem> = {}) => ({
	kind,
	id: `${kind}-${title}`,
	title,
	detail: '',
	href: '/',
	...extra
});

describe('command palette search (frontend-spec-3.md §7.4)', () => {
	it('ignores case, accents and extra spaces', () => {
		expect(normalizeSearch('  José   ÑÚÑEZ ')).toBe('jose nunez');
		expect(
			searchItems([item('person', 'José Ñúñez')], 'jose nun', SEARCH_ORDER.manager)
		).toHaveLength(1);
	});

	it('needs every word, and searches detail and extra text too', () => {
		const items = [
			item('person', 'Rosa Demo', { detail: 'Oak House' }),
			item('note', 'Shift note · Marcus Demo', { text: 'walked to the park' })
		];
		expect(searchItems(items, 'rosa oak', SEARCH_ORDER.manager)[0].items[0].title).toBe(
			'Rosa Demo'
		);
		expect(searchItems(items, 'rosa maple', SEARCH_ORDER.manager)).toEqual([]);
		expect(searchItems(items, 'park', SEARCH_ORDER.manager)[0].kind).toBe('note');
		expect(searchItems(items, '   ', SEARCH_ORDER.manager)).toEqual([]);
	});

	it('puts title-prefix matches first and keeps three per category', () => {
		const items = ['Ann Lee', 'Joann Ray', 'Anna Diaz', 'Annette Fox', 'Danny Anner'].map((n) =>
			item('person', n)
		);
		const [group] = searchItems(items, 'ann', SEARCH_ORDER.caregiver);
		expect(group.items.map((i) => i.title)).toEqual(['Ann Lee', 'Anna Diaz', 'Annette Fox']);
		expect(group.more).toBe(2);
	});

	it('orders categories by role', () => {
		const items = [
			item('note', 'Lunch note'),
			item('person', 'Lunch Person'),
			item('page', 'Lunch')
		];
		expect(searchItems(items, 'lunch', SEARCH_ORDER.caregiver).map((g) => g.kind)).toEqual([
			'page',
			'person',
			'note'
		]);
		expect(searchItems(items, 'lunch', SEARCH_ORDER.manager).map((g) => g.kind)).toEqual([
			'page',
			'note',
			'person'
		]);
	});
});
