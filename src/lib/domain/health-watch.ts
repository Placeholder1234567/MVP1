// Lomi's health watch: a rule-based scan of recent records for early signs of
// the "Fatal Five" (aspiration, bowel obstruction, dehydration, GERD,
// seizures) plus sepsis (charting-guide.md §3c, frontend-audit.md finding 16).
// These are prompts for a supervisor to look closer, never a diagnosis.

export const WATCH_CONDITIONS = [
	'aspiration',
	'bowel',
	'dehydration',
	'gerd',
	'seizure',
	'sepsis'
] as const;
export type WatchCondition = (typeof WATCH_CONDITIONS)[number];

export const WATCH_LABELS: Record<WatchCondition, string> = {
	aspiration: 'Aspiration',
	bowel: 'Bowel obstruction',
	dehydration: 'Dehydration',
	gerd: 'GERD / reflux',
	seizure: 'Seizures',
	sepsis: 'Sepsis'
};

/** Phrases from charting-guide.md §3c, as whole-word patterns. */
const KEYWORDS: Partial<Record<WatchCondition, RegExp>> = {
	aspiration:
		/\b(chok(?:e|ed|es|ing)|gagg?(?:ed|ing)|cough(?:ed|ing)? (?:during|while|at|after) (?:meals?|eating|drinking|lunch|dinner|breakfast)|(?:difficulty|trouble|problems?) swallowing|aspirat\w*)\b/i,
	bowel:
		/\b(constipat\w*|bloat(?:ed|ing)?|hard stools?|straining|impact(?:ed|ion)|no (?:bm|bowel movement))\b/i,
	dehydration:
		/\b(dehydrat\w*|dark urine|dry mouth|(?:refused|refusing|declined|little|low|not) (?:fluids?|drinks?|drinking|water))\b/i,
	gerd: /\b(heartburn|reflux|vomit(?:ed|ing|s)?|threw up|throwing up|regurgitat\w*)\b/i,
	seizure: /\b(seizures?|convuls\w*)\b/i
};
const INFECTION = /\b(infection|infected|uti|pneumonia|cellulitis|wound|chills|sepsis)\b/i;
/** "No choking", "did not vomit", "denies heartburn": the three words before a match. */
const NEGATION = /\b(no|not|never|without|denies|denied|didn'?t|did not|none)\b/i;

export interface WatchNote {
	at: string;
	text: string;
}
export interface WatchHealth {
	at: string;
	kind: string;
	data: Record<string, unknown>;
}
export interface WatchSignal {
	condition: WatchCondition;
	at: string;
	reason: string;
}

const DAY = 86_400_000;
export const WATCH_DAYS = 14;
/** Bowel: a tracked person with no movement observed for this many days. */
export const BOWEL_GAP_DAYS = 3;
export const FEVER_F = 100.4;

function snippet(text: string, index: number): string {
	const start = Math.max(0, text.lastIndexOf('.', index) + 1);
	const endDot = text.indexOf('.', index);
	const sentence = text.slice(start, endDot === -1 ? undefined : endDot + 1).trim();
	return sentence.length > 90 ? sentence.slice(0, 87).trimEnd() + '…' : sentence;
}

/** Each condition at most once per text, skipping negated mentions. */
export function keywordSignals(text: string, at: string): WatchSignal[] {
	const out: WatchSignal[] = [];
	for (const condition of WATCH_CONDITIONS) {
		const pattern = KEYWORDS[condition];
		if (!pattern) continue;
		const global = new RegExp(pattern.source, 'gi');
		for (const match of text.matchAll(global)) {
			const before = text.slice(0, match.index).split(/\s+/).slice(-3).join(' ');
			if (NEGATION.test(before)) continue;
			out.push({ condition, at, reason: `“${snippet(text, match.index!)}”` });
			break;
		}
	}
	return out;
}

const num = (v: unknown) => {
	const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
	return Number.isFinite(n) ? n : undefined;
};
const text = (data: Record<string, unknown>) =>
	Object.values(data)
		.filter((v) => typeof v === 'string')
		.join('. ');

/** Signals for one person from their recent notes and health entries, newest first. */
export function healthWatch(
	notes: WatchNote[],
	health: WatchHealth[],
	now: Date,
	days = WATCH_DAYS
): WatchSignal[] {
	const since = now.getTime() - days * DAY;
	const recent = <T extends { at: string }>(rows: T[]) =>
		rows.filter((r) => {
			const t = Date.parse(r.at);
			return t >= since && t <= now.getTime() + 60_000;
		});
	const n = recent(notes);
	const h = recent(health);
	const signals: WatchSignal[] = [];
	for (const note of n) signals.push(...keywordSignals(note.text, note.at));
	for (const entry of h) {
		if (entry.kind === 'seizure') {
			signals.push({ condition: 'seizure', at: entry.at, reason: 'Seizure recorded' });
			continue;
		}
		if (entry.kind !== 'vitals')
			signals.push(
				...keywordSignals(text(entry.data), entry.at).filter((s) => s.condition !== 'seizure')
			);
	}

	// Bowel: only for people whose bowel movements are being recorded.
	const bowel = h.filter((e) => e.kind === 'bowel');
	if (bowel.length) {
		const observed = bowel
			.filter((e) => e.data.status === 'Observed')
			.map((e) => Date.parse(e.at))
			.sort((a, b) => b - a)[0];
		const lastSeen = observed ?? Math.min(...bowel.map((e) => Date.parse(e.at)));
		const gap = Math.floor((now.getTime() - lastSeen) / DAY);
		if (gap >= BOWEL_GAP_DAYS)
			signals.push({
				condition: 'bowel',
				at: now.toISOString(),
				reason: observed
					? `No bowel movement recorded in ${gap} days`
					: `No bowel movement recorded since tracking began ${gap} days ago`
			});
	}

	// Sepsis: a fever with a fast pulse or breathing, or signs of infection within two days.
	const infections = [
		...n.filter((r) => INFECTION.test(r.text)).map((r) => Date.parse(r.at)),
		...h
			.filter((e) => e.kind !== 'vitals' && INFECTION.test(text(e.data)))
			.map((e) => Date.parse(e.at))
	];
	for (const v of h.filter((e) => e.kind === 'vitals')) {
		const temp = num(v.data.temp);
		if (temp === undefined || temp < FEVER_F) continue;
		const pulse = num(v.data.pulse);
		const breathing = num(v.data.respiration);
		const t = Date.parse(v.at);
		const infection = infections.some((i) => Math.abs(i - t) <= 2 * DAY);
		const why = [
			pulse !== undefined && pulse > 100 ? `pulse ${pulse}` : '',
			breathing !== undefined && breathing > 20 ? `breathing ${breathing}/min` : '',
			infection ? 'signs of infection noted' : ''
		].filter(Boolean);
		if (why.length)
			signals.push({
				condition: 'sepsis',
				at: v.at,
				reason: `Fever ${temp}°F with ${why.join(', ')}`
			});
	}
	return signals.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** Conditions flagged for a person, each with its count and latest signal. */
export function watchSummary(signals: WatchSignal[]) {
	return WATCH_CONDITIONS.flatMap((condition) => {
		const mine = signals.filter((s) => s.condition === condition);
		return mine.length ? [{ condition, count: mine.length, latest: mine[0] }] : [];
	});
}
