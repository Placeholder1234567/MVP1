// Controlled medication count book (frontend-spec-3 §13 item 33). US
// developmental-disability programs don't witness every dose: staff keep a
// running count of each controlled medication, two people count it when the
// medication keys change hands (usually each shift), and receipts, waste and
// disposal are witnessed. The MAR line shows the count (as Therap does).
// What each state asks for differs, so agencies start from a state preset.

export const CONTROLLED_SCHEDULES = ['II', 'III', 'IV', 'V'] as const;
export type ControlledSchedule = (typeof CONTROLLED_SCHEDULES)[number];

export const COUNT_KINDS = ['receipt', 'count', 'waste', 'disposal'] as const;
export type CountKind = (typeof COUNT_KINDS)[number];
export const COUNT_KIND_LABELS: Record<CountKind, string> = {
	receipt: 'Received from pharmacy',
	count: 'Count',
	waste: 'Wasted',
	disposal: 'Disposed of'
};

export const WASTE_REASONS = [
	'Refused after it was prepared',
	'Dropped or contaminated',
	'Partial dose',
	'Other'
] as const;
/** Group homes are usually not DEA registrants, so disposal goes through these routes. */
export const DISPOSAL_METHODS = [
	'Returned to the pharmacy',
	'Pharmacy collection receptacle or take-back',
	'Mail-back envelope',
	'Other method approved by your state'
] as const;

export type WitnessQualification = 'med_certified' | 'any_staff';
export interface ControlledRules {
	state: StateCode;
	/** How often every controlled medication is counted with a witness. */
	countEvery: 'shift' | 'day';
	/** Which entries need a second person. */
	witness: Record<CountKind, boolean>;
	witnessQualification: WitnessQualification;
	/** A witness who couldn't be present countersigns within this many hours. */
	countersignHours: number;
}

export const STATE_CODES = ['MN', 'CA', 'NY', 'NJ', 'other'] as const;
export type StateCode = (typeof STATE_CODES)[number];

const ALL_WITNESSED: Record<CountKind, boolean> = {
	receipt: true,
	count: true,
	waste: true,
	disposal: true
};

/**
 * Starting points per state. Regulations mostly leave counts to the agency's
 * own medication policy; the notes say where the preset comes from so an
 * administrator can check it against their policy and licensing rules.
 */
export const STATE_PRESETS: Record<
	StateCode,
	{ label: string; rules: ControlledRules; note: string }
> = {
	MN: {
		label: 'Minnesota',
		rules: {
			state: 'MN',
			countEvery: 'shift',
			witness: ALL_WITNESSED,
			witnessQualification: 'med_certified',
			countersignHours: 24
		},
		note: 'Chapter 245D: Schedule II medications kept locked; counts and disposal follow your medication administration policy (245D.11).'
	},
	CA: {
		label: 'California',
		rules: {
			state: 'CA',
			countEvery: 'shift',
			witness: ALL_WITNESSED,
			witnessQualification: 'any_staff',
			countersignHours: 24
		},
		note: 'Title 22 §80075 and form LIC 622: medications are destroyed by the administrator or a designee, witnessed by one other adult who is not a client.'
	},
	NY: {
		label: 'New York',
		rules: {
			state: 'NY',
			countEvery: 'shift',
			witness: ALL_WITNESSED,
			witnessQualification: 'med_certified',
			countersignHours: 24
		},
		note: '14 NYCRR 633.17: controlled substances double-locked; disposal by two people, such as nurses or staff certified in medication administration.'
	},
	NJ: {
		label: 'New Jersey',
		rules: {
			state: 'NJ',
			countEvery: 'shift',
			witness: ALL_WITNESSED,
			witnessQualification: 'med_certified',
			countersignHours: 24
		},
		note: 'N.J.A.C. 10:44A: staff keep keys for accountability checks; DDD asks that controlled medications be double-locked and accounted for.'
	},
	other: {
		label: 'Another state',
		rules: {
			state: 'other',
			countEvery: 'shift',
			witness: ALL_WITNESSED,
			witnessQualification: 'med_certified',
			countersignHours: 24
		},
		note: 'Two-person counts at every shift change, with witnessed receipts, waste and disposal, are the common practice. Check your state’s rules.'
	}
};
export const DEFAULT_CONTROLLED_RULES = STATE_PRESETS.other.rules;

/** The agency's rules from agencies.settings.controlled_rules; anything invalid keeps the default. */
export function parseControlledRules(settings: unknown): ControlledRules {
	let v = settings;
	if (typeof v === 'string') {
		try {
			v = JSON.parse(v);
		} catch {
			v = {};
		}
	}
	const raw = (
		v && typeof v === 'object' ? (v as Record<string, unknown>).controlled_rules : null
	) as Record<string, unknown> | null | undefined;
	if (!raw || typeof raw !== 'object') return DEFAULT_CONTROLLED_RULES;
	const state = (STATE_CODES as readonly unknown[]).includes(raw.state)
		? (raw.state as StateCode)
		: 'other';
	const base = STATE_PRESETS[state].rules;
	const w = (raw.witness && typeof raw.witness === 'object' ? raw.witness : {}) as Record<
		string,
		unknown
	>;
	const hours = Number(raw.countersignHours);
	return {
		state,
		countEvery:
			raw.countEvery === 'day' || raw.countEvery === 'shift' ? raw.countEvery : base.countEvery,
		witness: Object.fromEntries(
			COUNT_KINDS.map((k) => [k, typeof w[k] === 'boolean' ? (w[k] as boolean) : base.witness[k]])
		) as Record<CountKind, boolean>,
		witnessQualification:
			raw.witnessQualification === 'any_staff' || raw.witnessQualification === 'med_certified'
				? raw.witnessQualification
				: base.witnessQualification,
		countersignHours:
			Number.isInteger(hours) && hours >= 1 && hours <= 72 ? hours : base.countersignHours
	};
}

export interface WitnessCandidate {
	id: string;
	active: boolean | number | null;
	med_certified: boolean | number | null;
}
/** Whether this person may witness an entry recorded by someone else. */
export function canWitness(
	rules: ControlledRules,
	candidate: WitnessCandidate,
	recordedBy: string
): boolean {
	if (candidate.id === recordedBy || !candidate.active) return false;
	return rules.witnessQualification === 'any_staff' || !!candidate.med_certified;
}

export interface CountEntry {
	kind: string | null;
	quantity: number | null;
	recorded_at: string | null;
}
export interface DoseEntry {
	id: string;
	status: string | null;
	recorded_at: string | null;
	amends_id: string | null;
	conflict_with: string | null;
}

/**
 * Doses that took stock: given, not later corrected to something else, and
 * not a duplicate conflict record. A correction keeps the original's time.
 */
export function givenDoseTimes(doses: readonly DoseEntry[]): string[] {
	const byId = new Map(doses.map((d) => [d.id, d]));
	const corrected = new Set(doses.map((d) => d.amends_id).filter((x): x is string => !!x));
	const times: string[] = [];
	for (const d of doses) {
		if (corrected.has(d.id) || d.conflict_with || d.status !== 'given') continue;
		let original = d;
		while (original.amends_id && byId.has(original.amends_id))
			original = byId.get(original.amends_id)!;
		if (original.recorded_at) times.push(original.recorded_at);
	}
	return times;
}

const ms = (iso: string | null) => (iso ? Date.parse(iso) : NaN);

/**
 * What should be on hand now: the last count, plus receipts since, minus
 * given doses, waste and disposal since. Without a count yet, it starts at 0.
 */
export function expectedOnHand(
	entries: readonly CountEntry[],
	doses: readonly DoseEntry[],
	unitsPerDose: number
): { expected: number; lastCount: string | null } {
	const sorted = entries
		.filter((e) => e.recorded_at && Number.isFinite(e.quantity))
		.toSorted((a, b) => ms(a.recorded_at) - ms(b.recorded_at));
	const last = sorted.findLast((e) => e.kind === 'count');
	const since = last ? ms(last.recorded_at) : -Infinity;
	let expected = last ? (last.quantity as number) : 0;
	for (const e of sorted) {
		if (ms(e.recorded_at) <= since) continue;
		if (e.kind === 'receipt') expected += e.quantity as number;
		else if (e.kind === 'waste' || e.kind === 'disposal') expected -= e.quantity as number;
	}
	const given = givenDoseTimes(doses).filter((t) => ms(t) > since).length;
	expected -= given * (unitsPerDose > 0 ? unitsPerDose : 1);
	return { expected: Math.round(expected * 100) / 100, lastCount: last?.recorded_at ?? null };
}

export const isDiscrepancy = (counted: number, expected: number) =>
	Math.abs(counted - expected) > 0.001;

/** Why an entry can't be saved, or null. */
export function countEntryError(e: {
	kind: string;
	quantity: number;
	reason?: string | null;
	needsWitness: boolean;
	witnessId?: string | null;
}): string | null {
	if (!(COUNT_KINDS as readonly string[]).includes(e.kind)) return 'Choose what you are recording.';
	if (!Number.isFinite(e.quantity) || e.quantity < 0 || e.quantity > 100000)
		return 'Enter the amount as a number.';
	if (e.kind !== 'count' && e.quantity === 0) return 'Enter an amount above zero.';
	if ((e.kind === 'waste' || e.kind === 'disposal') && !e.reason?.trim())
		return e.kind === 'waste' ? 'Choose why it was wasted.' : 'Choose how it was disposed of.';
	if (e.needsWitness && !e.witnessId) return 'Choose who witnessed this.';
	return null;
}

/** Start of the current count period: the shift (07, 15, 23) or the agency day. */
export function countPeriodStart(at: Date, timeZone: string, every: 'shift' | 'day'): Date {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23'
	}).formatToParts(at);
	const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
	const hour = get('hour');
	const startHour = every === 'day' ? 0 : hour >= 23 ? 23 : hour >= 15 ? 15 : hour >= 7 ? 7 : -1;
	// Back from now to the boundary in local wall time; -1 means 23:00 yesterday.
	const back =
		((hour - startHour) * 60 + get('minute')) * 60_000 +
		get('second') * 1000 +
		at.getMilliseconds();
	return new Date(at.getTime() - back);
}

/** Whether a witnessed count is still needed this shift (or day) for a medication. */
export function countDue(
	entries: readonly (CountEntry & { witness_status?: string | null })[],
	now: Date,
	timeZone: string,
	rules: ControlledRules
): boolean {
	const start = countPeriodStart(now, timeZone, rules.countEvery).getTime();
	return !entries.some(
		(e) =>
			e.kind === 'count' &&
			ms(e.recorded_at) >= start &&
			(!rules.witness.count || e.witness_status === 'verified' || e.witness_status === 'pending')
	);
}

/** A pending witness past the agency's countersign window. */
export function countersignOverdue(
	e: { witness_status: string | null; recorded_at: string | null },
	rules: ControlledRules,
	now: Date
): boolean {
	return (
		e.witness_status === 'pending' &&
		now.getTime() - ms(e.recorded_at) > rules.countersignHours * 3_600_000
	);
}
