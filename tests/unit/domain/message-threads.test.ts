import { describe, expect, it } from 'vitest';
import { boardThreads, threadRootId } from '../../../src/lib/domain/message-threads';

const msg = (id: string, sent_at: string, reply_to: string | null = null) => ({
	id,
	sent_at,
	reply_to
});

describe('boardThreads', () => {
	it('puts replies under their first message, oldest first', () => {
		const threads = boardThreads([
			msg('r2', '2026-10-18T10:05:00Z', 'a'),
			msg('a', '2026-10-18T10:00:00Z'),
			msg('r1', '2026-10-18T10:01:00Z', 'a')
		]);
		expect(threads).toHaveLength(1);
		expect(threads[0].root.id).toBe('a');
		expect(threads[0].replies.map((r) => r.id)).toEqual(['r1', 'r2']);
		expect(threads[0].lastAt).toBe('2026-10-18T10:05:00Z');
	});

	it('orders threads by their latest activity', () => {
		const threads = boardThreads([
			msg('new', '2026-10-18T11:00:00Z'),
			msg('old', '2026-10-18T09:00:00Z'),
			msg('reply', '2026-10-18T12:00:00Z', 'old')
		]);
		expect(threads.map((t) => t.root.id)).toEqual(['old', 'new']);
	});

	it('shows a reply on its own when its first message has left the device', () => {
		const [t] = boardThreads([msg('reply', '2026-10-18T12:00:00Z', 'gone')]);
		expect(t).toMatchObject({ root: { id: 'reply' }, orphan: true, replies: [] });
	});

	it('finds the thread a message belongs to', () => {
		expect(threadRootId(msg('a', 'x'))).toBe('a');
		expect(threadRootId(msg('r', 'x', 'a'))).toBe('a');
	});
});
