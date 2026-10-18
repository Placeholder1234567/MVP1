import { describe, expect, it } from 'vitest';
import { seenBy, seenByLabel, unseenMessages } from '../../../src/lib/domain/message-reads';

const ME = 'me';
const msg = (id: string, created_by: string | null, home_id = 'oak') => ({
	id,
	created_by,
	home_id
});
const read = (
	message_id: string,
	profile_id: string,
	read_at: string,
	reader_name = profile_id
) => ({
	message_id,
	profile_id,
	read_at,
	reader_name
});

describe('unseenMessages', () => {
	it('counts other people’s messages on this board that I have no receipt for', () => {
		const messages = [
			msg('a', 'ana'),
			msg('b', 'ana'),
			msg('c', ME),
			msg('d', null),
			msg('e', 'ana', 'maple')
		];
		const reads = [read('a', ME, '2026-10-18T08:00:00Z'), read('b', 'ben', '2026-10-18T08:00:00Z')];
		expect(unseenMessages(messages, reads, ME, 'oak').map((m) => m.id)).toEqual(['b']);
		expect(unseenMessages(messages, reads, ME, '')).toEqual([]);
	});
});

describe('seenBy', () => {
	it('lists each reader once, earliest first, never the author', () => {
		const m = msg('a', 'ana');
		const reads = [
			read('a', 'ben', '2026-10-18T09:00:00Z', 'Ben'),
			read('a', 'cy', '2026-10-18T08:00:00Z', 'Cy'),
			read('a', 'ben', '2026-10-18T08:30:00Z', 'Ben'),
			read('a', 'ana', '2026-10-18T07:00:00Z', 'Ana'),
			read('z', 'dee', '2026-10-18T07:00:00Z', 'Dee')
		];
		expect(seenBy(m, reads)).toEqual([
			{ profileId: 'cy', name: 'Cy', at: '2026-10-18T08:00:00Z' },
			{ profileId: 'ben', name: 'Ben', at: '2026-10-18T08:30:00Z' }
		]);
	});
});

describe('seenByLabel', () => {
	it('reads naturally for any number of readers', () => {
		expect(seenByLabel([])).toBe('Not seen yet');
		expect(seenByLabel(['Ana'])).toBe('Seen by Ana');
		expect(seenByLabel(['Ana', 'Ben'])).toBe('Seen by Ana and Ben');
		expect(seenByLabel(['Ana', 'Ben', 'Cy'])).toBe('Seen by Ana, Ben and Cy');
		expect(seenByLabel(['Ana', 'Ben', 'Cy', 'Dee'])).toBe('Seen by Ana, Ben and 2 others');
	});
});
