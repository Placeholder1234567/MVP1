// Earlier versions of a note (frontend-audit.md finding 14): the audit trail
// keeps every saved state of a note, so a supervisor reviewing a resubmitted
// note can see what changed since the version they sent back.

export interface NoteState {
	at: string;
	by: string | null;
	status: string;
	content: Record<string, string>;
}
export interface SignedVersion extends NoteState {
	/** 1 for the first signature, 2 for the first resubmission, ... */
	number: number;
}

/** Every state in which the author signed the note, in order. */
export function signedVersions(states: NoteState[]): SignedVersion[] {
	const out: SignedVersion[] = [];
	let previous = '';
	for (const s of states) {
		if (s.status === 'submitted' && previous !== 'submitted')
			out.push({ ...s, number: out.length + 1 });
		previous = s.status;
	}
	return out;
}

export type DiffPart = { kind: 'same' | 'added' | 'removed'; text: string };

/** Above this many word pairs the diff falls back to whole old / new text. */
const MAX_CELLS = 4_000_000;

/** Word-level difference between two texts (longest common subsequence). */
export function wordDiff(before: string, after: string): DiffPart[] {
	const a = before.split(/(\s+)/).filter(Boolean);
	const b = after.split(/(\s+)/).filter(Boolean);
	if (a.length * b.length > MAX_CELLS)
		return [
			...(before ? [{ kind: 'removed' as const, text: before }] : []),
			...(after ? [{ kind: 'added' as const, text: after }] : [])
		];
	// lcs[i][j]: common length of a[i..] and b[j..]
	const lcs = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
	for (let i = a.length - 1; i >= 0; i--)
		for (let j = b.length - 1; j >= 0; j--)
			lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
	const parts: DiffPart[] = [];
	const push = (kind: DiffPart['kind'], text: string) => {
		const last = parts[parts.length - 1];
		if (last?.kind === kind) last.text += text;
		else parts.push({ kind, text });
	};
	let i = 0,
		j = 0;
	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			push('same', a[i]);
			i++;
			j++;
		} else if (lcs[i + 1][j] >= lcs[i][j + 1]) push('removed', a[i++]);
		else push('added', b[j++]);
	}
	while (i < a.length) push('removed', a[i++]);
	while (j < b.length) push('added', b[j++]);
	return parts;
}

/** Sections whose text changed between two versions, with their word diff. */
export function sectionChanges(
	before: Record<string, string>,
	after: Record<string, string>
): { section: string; parts: DiffPart[] }[] {
	const sections = [...new Set([...Object.keys(before), ...Object.keys(after)])];
	return sections
		.filter((k) => (before[k] ?? '') !== (after[k] ?? ''))
		.map((section) => ({ section, parts: wordDiff(before[section] ?? '', after[section] ?? '') }));
}
