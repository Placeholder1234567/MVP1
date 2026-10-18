// Read receipts on the home message board (frontend-audit.md finding 19).
// Pure helpers shared by the board and the navigation badge.

export interface BoardMessage {
	id: string;
	home_id: string | null;
	created_by: string | null;
}
export interface ReadReceipt {
	message_id: string | null;
	profile_id: string | null;
	reader_name: string | null;
	read_at: string | null;
}

/** Messages on this home's board, written by someone else, that this person hasn't seen yet. */
export function unseenMessages<M extends BoardMessage>(
	messages: M[],
	reads: ReadReceipt[],
	profileId: string,
	homeId: string | null | undefined
): M[] {
	if (!homeId) return [];
	const seen = new Set(reads.filter((r) => r.profile_id === profileId).map((r) => r.message_id));
	return messages.filter(
		(m) =>
			m.home_id === homeId && m.created_by != null && m.created_by !== profileId && !seen.has(m.id)
	);
}

/** Who has seen a message, earliest first, one entry per person, never the author. */
export function seenBy(
	message: BoardMessage,
	reads: ReadReceipt[]
): { profileId: string; name: string; at: string }[] {
	const out = new Map<string, { profileId: string; name: string; at: string }>();
	for (const r of reads) {
		if (r.message_id !== message.id || !r.profile_id || r.profile_id === message.created_by)
			continue;
		const at = r.read_at ?? '';
		const prior = out.get(r.profile_id);
		if (!prior || at < prior.at)
			out.set(r.profile_id, { profileId: r.profile_id, name: r.reader_name ?? 'Someone', at });
	}
	return [...out.values()].sort((a, b) => a.at.localeCompare(b.at));
}

/** "Seen by Ana", "Seen by Ana and Ben", "Seen by Ana, Ben and 3 others". */
export function seenByLabel(names: string[]): string {
	if (!names.length) return 'Not seen yet';
	if (names.length === 1) return `Seen by ${names[0]}`;
	if (names.length <= 3)
		return `Seen by ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
	const rest = names.length - 2;
	return `Seen by ${names[0]}, ${names[1]} and ${rest} other${rest === 1 ? '' : 's'}`;
}
