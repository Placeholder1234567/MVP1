// Board threads (frontend-audit.md finding 19): replies sit under the message
// that started the thread, and threads are ordered by their latest activity.

export interface ThreadMessage {
	id: string;
	reply_to: string | null;
	sent_at: string | null;
}

export interface BoardThread<M extends ThreadMessage> {
	root: M;
	/** Oldest first, as a conversation reads. */
	replies: M[];
	/** A reply whose first message is no longer on this device (older than the sync window). */
	orphan: boolean;
	/** The latest message in the thread, for ordering. */
	lastAt: string;
}

const at = (m: ThreadMessage) => m.sent_at ?? '';

/** Groups a board's messages into threads, most recently active first. */
export function boardThreads<M extends ThreadMessage>(messages: readonly M[]): BoardThread<M>[] {
	const ids = new Set(messages.map((m) => m.id));
	const replies = new Map<string, M[]>();
	const threads: BoardThread<M>[] = [];
	for (const m of messages) {
		if (m.reply_to && ids.has(m.reply_to)) {
			const list = replies.get(m.reply_to) ?? [];
			list.push(m);
			replies.set(m.reply_to, list);
		} else threads.push({ root: m, replies: [], orphan: !!m.reply_to, lastAt: at(m) });
	}
	for (const t of threads) {
		t.replies = (replies.get(t.root.id) ?? []).toSorted((a, b) => at(a).localeCompare(at(b)));
		for (const r of t.replies) if (at(r) > t.lastAt) t.lastAt = at(r);
	}
	return threads.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

/** The thread a reply belongs to: replies always point at the first message. */
export const threadRootId = (m: ThreadMessage) => m.reply_to ?? m.id;
