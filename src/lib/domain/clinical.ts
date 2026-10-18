// Care-record rules shared by the device and the server: health entry fields,
// incident wizard options and the supervisor attention queue
// (frontend-spec-2.md §3.4-3.6, frontend-spec-3.md §4.1, charting-ux.md §4.5-4.8).
import { vitalFlags, type VitalFlag } from './vitals';
import {
	incidentNotifyRules,
	INCIDENT_TYPES,
	type IncidentRules,
	type IncidentSeverity,
	type IncidentType
} from './charting';
import { addDays, localTime } from './time';

// ─── Health entries ────────────────────────────────────────────────────────

export const HEALTH_KINDS = [
	{ key: 'vitals', label: 'Vitals' },
	{ key: 'seizure', label: 'Seizure' },
	{ key: 'illness', label: 'Illness' },
	{ key: 'appointment', label: 'Visit' },
	{ key: 'bowel', label: 'Bowel' }
] as const;
export type HealthKind = (typeof HEALTH_KINDS)[number]['key'];
export const BOWEL_STATUSES = ['Observed', 'Not observed', 'Declined'] as const;

export function healthKindLabel(kind: string | null | undefined): string {
	return HEALTH_KINDS.find((k) => k.key === kind)?.label ?? 'Health';
}

export interface HealthField {
	key: string;
	label: string;
	input: 'number' | 'text' | 'textarea' | 'time' | 'date' | 'select';
	unit?: string;
	/** Decimal readings (temperature, weight) */
	decimal?: boolean;
	placeholder?: string;
	options?: readonly string[];
	/** Shown side by side with the neighbouring half-width field */
	half?: boolean;
	required?: boolean;
	/** False means no automatic clinical alert limits have been configured. */
	alertConfigured?: boolean;
}

/**
 * Form fields per entry type. Keys are what the server stores in
 * health_entries.data (health service DATA schemas); keep the two in step so
 * nothing a caregiver types is dropped on upload.
 */
export const HEALTH_FIELDS: Record<HealthKind, readonly HealthField[]> = {
	vitals: [
		{ key: 'systolic', label: 'Blood pressure, top', input: 'number', unit: 'mmHg', half: true },
		{
			key: 'diastolic',
			label: 'Blood pressure, bottom',
			input: 'number',
			unit: 'mmHg',
			half: true
		},
		{ key: 'pulse', label: 'Pulse', input: 'number', unit: 'bpm', half: true },
		{ key: 'temp', label: 'Temperature', input: 'number', unit: '°F', decimal: true, half: true },
		{ key: 'weight', label: 'Weight', input: 'number', unit: 'lb', decimal: true },
		{
			key: 'respiration',
			label: 'Respiratory rate',
			input: 'number',
			unit: 'breaths/min',
			decimal: true,
			alertConfigured: false
		},
		{
			key: 'oxygen',
			label: 'SpO2',
			input: 'number',
			unit: '%',
			decimal: true,
			alertConfigured: false
		},
		{
			key: 'glucose',
			label: 'Blood glucose',
			input: 'number',
			unit: 'mg/dL',
			decimal: true,
			alertConfigured: false
		}
	],
	seizure: [
		{ key: 'started', label: 'Started at', input: 'time', half: true, required: true },
		{ key: 'duration', label: 'Lasted', input: 'text', placeholder: 'About 2 minutes', half: true },
		{
			key: 'observed',
			label: 'What you saw',
			input: 'textarea',
			placeholder: 'Describe exactly what you observed',
			required: true
		},
		{
			key: 'postIctal',
			label: 'Afterwards',
			input: 'textarea',
			placeholder: 'How they were after'
		},
		{
			key: 'actions',
			label: 'What you did',
			input: 'textarea',
			placeholder: 'Steps you took from the seizure protocol'
		}
	],
	illness: [
		{
			key: 'symptoms',
			label: 'Symptoms',
			input: 'textarea',
			placeholder: 'What you noticed',
			required: true
		},
		{ key: 'onset', label: 'Started', input: 'text', placeholder: 'This morning' },
		{
			key: 'contagious',
			label: 'Might it spread to others?',
			input: 'select',
			options: ['Not sure', 'Yes', 'No']
		},
		{
			key: 'actions',
			label: 'What you did',
			input: 'textarea',
			placeholder: 'Who you told and what you did'
		}
	],
	bowel: [
		{
			key: 'status',
			label: 'Observation',
			input: 'select',
			options: BOWEL_STATUSES,
			required: true
		},
		{ key: 'time', label: 'Time of observation or check', input: 'time' },
		{ key: 'consistency', label: 'Consistency (only if observed)', input: 'text' },
		{ key: 'notes', label: 'Notes', input: 'textarea' }
	],
	appointment: [
		{ key: 'date', label: 'Date', input: 'date' },
		{ key: 'provider', label: 'With', input: 'text', required: true },
		{ key: 'reason', label: 'Reason', input: 'text' },
		{
			key: 'outcome',
			label: 'Outcome and follow-up',
			input: 'textarea',
			placeholder: 'What the provider said and any next steps'
		}
	]
};

/**
 * Typo guard, not a clinical rule: readings outside these bounds are almost
 * certainly mistyped (e.g. 1200 for 120), so the form asks to check them.
 */
export const HEALTH_READING_LIMITS = {
	systolic: [40, 300],
	diastolic: [20, 200],
	pulse: [20, 250],
	temp: [85, 110],
	weight: [1, 1000],
	// Technical input bounds, not clinical alert limits. Zero is an explicit entry.
	respiration: [0, 1000],
	oxygen: [0, 100],
	glucose: [0, 10000]
} as const;

/** Accept only entered decimal readings. Blanks/null are absent, never inferred zero. */
export function healthReading(
	key: keyof typeof HEALTH_READING_LIMITS,
	raw: unknown
): { ok: true; value: number | undefined } | { ok: false } {
	if (raw == null || (typeof raw === 'string' && !raw.trim()))
		return { ok: true, value: undefined };
	if (
		typeof raw !== 'number' &&
		(typeof raw !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw.trim()))
	)
		return { ok: false };
	const value = typeof raw === 'number' ? raw : Number(raw.trim());
	const [lo, hi] = HEALTH_READING_LIMITS[key];
	return Number.isFinite(value) && value >= lo && value <= hi ? { ok: true, value } : { ok: false };
}

export function bowelDataError(data: Record<string, unknown>): string | null {
	if (!(BOWEL_STATUSES as readonly unknown[]).includes(data.status))
		return 'Choose what was observed or whether the check was declined.';
	if (
		data.time &&
		(typeof data.time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(data.time))
	)
		return 'Check the observation time.';
	if (data.status !== 'Observed' && typeof data.consistency === 'string' && data.consistency.trim())
		return 'Only add consistency when a movement was observed.';
	return null;
}

/** Plain-language reason a health entry can't be saved yet (MVP hsave rules). */
const REQUIRED_MESSAGE: Record<HealthKind, string> = {
	vitals: 'Enter at least one reading.',
	seizure: 'Add when it started and what you saw.',
	illness: 'Describe the symptoms.',
	appointment: 'Add who the visit was with.',
	bowel: 'Choose what was observed or whether the check was declined.'
};

export type HealthPayload =
	{ ok: true; data: Record<string, string | number> } | { ok: false; error: string };

/** Turns form text into the stored data object, or says what to fix. */
export function healthPayload(
	kind: HealthKind,
	fields: Record<string, string | number | null | undefined>
): HealthPayload {
	const data: Record<string, string | number> = {};
	for (const field of HEALTH_FIELDS[kind]) {
		const raw = fields[field.key];
		if (
			field.input === 'number' &&
			raw != null &&
			typeof raw !== 'string' &&
			typeof raw !== 'number'
		)
			return { ok: false, error: `Check the ${field.label.toLowerCase()} reading.` };
		const value = String(fields[field.key] ?? '').trim();
		if (!value) {
			if (field.required) return { ok: false, error: REQUIRED_MESSAGE[kind] };
			continue;
		}
		if (field.input === 'number') {
			const reading = healthReading(
				field.key as keyof typeof HEALTH_READING_LIMITS,
				fields[field.key]
			);
			if (!reading.ok) {
				return { ok: false, error: `Check the ${field.label.toLowerCase()} reading.` };
			}
			if (reading.value !== undefined) data[field.key] = reading.value;
		} else {
			if (value.length > 1000)
				return { ok: false, error: 'Keep each health answer within 1000 characters.' };
			data[field.key] = value;
		}
	}
	if (kind === 'bowel') {
		const error = bowelDataError(data);
		if (error) return { ok: false, error };
	}
	if (!Object.keys(data).length) return { ok: false, error: REQUIRED_MESSAGE[kind] };
	return { ok: true, data };
}

/** Vital flags for stored or typed vitals data (keys as in HEALTH_FIELDS). */
export function healthFlags(kind: string, data: Record<string, unknown>): VitalFlag[] {
	if (kind !== 'vitals') return [];
	const n = (v: unknown) => (v === '' || v == null ? null : Number(v));
	return vitalFlags({
		temp: n(data.temp),
		pulse: n(data.pulse),
		sys: n(data.systolic),
		dia: n(data.diastolic)
	});
}

const FIELD_NAME: Record<string, string> = {
	temp: 'Temperature',
	pulse: 'Pulse',
	systolic: 'Blood pressure (top)',
	diastolic: 'Blood pressure (bottom)'
};

/** Inline warning for one vitals field (charting-ux.md §4.6), or null. */
export function vitalFieldWarning(
	key: string,
	value: string | number | null | undefined
): string | null {
	value = value == null ? '' : String(value);
	if (!value.trim() || !Number.isFinite(Number(value))) return null;
	if (!healthFlags('vitals', { [key]: value }).length) return null;
	return `${FIELD_NAME[key] ?? 'This reading'} is outside the normal range.`;
}

const FLAG_LABEL: Record<string, string> = {
	temperature: 'Temperature',
	pulse: 'Pulse',
	blood_pressure: 'Blood pressure'
};
export function flagLabel(flag: string): string {
	return FLAG_LABEL[flag] ?? flag.replaceAll('_', ' ');
}

/** One-line summary of a health entry, as in the MVP's Recent list. */
export function healthSummary(
	kind: string | null | undefined,
	data: Record<string, unknown>
): string {
	const s = (v: unknown) => (v == null || v === '' ? '' : String(v));
	const parts =
		kind === 'vitals'
			? [
					data.systolic && data.diastolic ? `BP ${s(data.systolic)}/${s(data.diastolic)}` : '',
					data.pulse ? `Pulse ${s(data.pulse)}` : '',
					data.temp ? `${s(data.temp)}°F` : '',
					data.weight ? `${s(data.weight)} lb` : '',
					data.respiration != null && data.respiration !== ''
						? `Respiratory rate ${s(data.respiration)} breaths/min`
						: '',
					data.oxygen != null && data.oxygen !== '' ? `SpO2 ${s(data.oxygen)}%` : '',
					data.glucose != null && data.glucose !== ''
						? `Blood glucose ${s(data.glucose)} mg/dL`
						: ''
				]
			: kind === 'bowel'
				? [
						s(data.status),
						s(data.time),
						data.status === 'Observed' ? s(data.consistency) : '',
						s(data.notes)
					]
				: kind === 'seizure'
					? [s(data.duration), s(data.observed ?? data.type)]
					: kind === 'illness'
						? [s(data.symptoms), data.contagious === 'Yes' ? 'May be contagious' : '']
						: [s(data.provider), s(data.reason)];
	return parts.filter(Boolean).join(' · ');
}

// ─── Medications ───────────────────────────────────────────────────────────

/** Answers for "Did it help?" after an as-needed dose (charting-ux.md §4.5). */
export const PRN_EFFECTS = ['Symptoms went away', 'Helped some', 'No change', 'Got worse'] as const;

export type DoseStatus = 'given' | 'refused' | 'held';

/** "20:30" or "08:00:00" -> "8:30pm" / "8:00am" (MVP t12). */
export function clock12(time: string): string {
	const [h = 0, m = 0] = time.split(':').map(Number);
	return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
}

/** Server rule (medication service): refused, held, PRN and corrections need a reason. */
export function doseNeedsReason(status: DoseStatus, prn: boolean, correction: boolean): boolean {
	return correction || prn || status !== 'given';
}

/** What the reason box asks for each kind of MAR entry. */
export function doseReasonLabel(status: DoseStatus, prn: boolean, correction: boolean): string {
	if (correction) return 'What was wrong with the earlier entry?';
	if (prn) return 'Why is it needed?';
	return status === 'held' ? 'Why was it held?' : 'What happened when you offered it?';
}

// ─── Incidents ─────────────────────────────────────────────────────────────

export const INCIDENT_LOCATIONS = [
	'Bedroom',
	'Bathroom',
	'Kitchen',
	'Living room',
	'Outside',
	'Community',
	'Vehicle',
	'Other'
] as const;
export const INJURY_ANSWERS = ['No injury seen', 'Yes', 'Not checked yet'] as const;
export const MEDICAL_FOLLOWUP = [
	'None needed',
	'Nurse to check',
	'Doctor visit',
	'Emergency care'
] as const;
export const INCIDENT_SEVERITIES: readonly IncidentSeverity[] = ['Low', 'Medium', 'High'];

/** The local time rounded to the nearest 5 minutes, "HH:MM" (never past 23:55). */
export function roundedClock(at: Date, timeZone: string): string {
	const t = localTime(at, timeZone);
	const m = Math.min(Math.round((t.hour * 60 + t.minute) / 5) * 5, 23 * 60 + 55);
	return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * The instant a wall-clock day and time ("YYYY-MM-DD", "HH:MM") happened in
 * timeZone, using the zone's offset at that moment (correct across daylight
 * saving changes).
 */
export function zonedInstant(day: string, time: string, timeZone: string): Date {
	const [h, m] = time.split(':').map(Number);
	const target = Date.parse(`${day}T00:00:00Z`) + (h * 60 + m) * 60_000;
	let guess = target;
	for (let i = 0; i < 2; i++) {
		const local = localTime(new Date(guess), timeZone);
		const shown = Date.parse(`${local.day}T00:00:00Z`) + (local.hour * 60 + local.minute) * 60_000;
		guess += target - shown;
	}
	return new Date(guess);
}

/**
 * When an incident reported with only a time happened: today at that time, or
 * yesterday if that would be in the future (an overnight shift reporting a
 * 23:40 incident after midnight). Null if the time can't be read.
 */
export function incidentOccurredAt(time: string, now: Date, timeZone: string): Date | null {
	const match = /^(\d{2}):(\d{2})$/.exec(time);
	if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
	const today = localTime(now, timeZone).day;
	const at = zonedInstant(today, time, timeZone);
	return at.getTime() > now.getTime() + 5 * 60_000
		? zonedInstant(addDays(today, -1), time, timeZone)
		: at;
}

/**
 * Required contacts the reporter has not marked as told. The supervisor is
 * left out: filing the report alerts them.
 */
export function missingNotifications(
	severity: string | null | undefined,
	type: string | null | undefined,
	notified: readonly string[],
	rules?: IncidentRules
): string[] {
	const sev = (INCIDENT_SEVERITIES as readonly string[]).includes(severity ?? '')
		? (severity as IncidentSeverity)
		: 'Low';
	const kind = (INCIDENT_TYPES as readonly string[]).includes(type ?? '')
		? (type as IncidentType)
		: 'Other';
	return incidentNotifyRules(sev, kind, rules)
		.map((r) => r.who as string)
		.filter((who) => who !== 'Supervisor' && !notified.includes(who));
}

// ─── Supervisor attention queue ───────────────────────────────────────────

export type Urgency = 'critical' | 'action' | 'info';
export const URGENCY_BANDS: readonly { key: Urgency; label: string }[] = [
	{ key: 'critical', label: 'Critical' },
	{ key: 'action', label: 'Needs action' },
	{ key: 'info', label: 'Informational' }
];

export type AttentionKind =
	'incident' | 'health' | 'dose' | 'controlled' | 'coverage' | 'clock' | 'note';

export interface AttentionItem {
	kind: AttentionKind;
	id: string;
	urgency: Urgency;
	clientId: string | null;
	/** Short description; the screen adds the person's name and formats `at` */
	title: string;
	detail: string;
	/** ISO timestamp (YYYY-MM-DD for coverage), used for ordering */
	at: string;
	pill: 'Incident' | 'Health' | 'Medication' | 'Coverage' | 'Check-in' | 'Review';
}

type Bool = number | boolean | null | undefined;
type Json = string | readonly string[] | null | undefined;

export interface AttentionInput {
	/** Today in the agency's time zone, YYYY-MM-DD */
	today: string;
	/** The agency's incident reporting rules (defaults when absent) */
	incidentRules?: IncidentRules;
	incidents: readonly {
		id: string;
		client_id: string | null;
		type: string | null;
		severity: string | null;
		status: string | null;
		notified_parties: Json;
		occurred_at: string | null;
	}[];
	health: readonly {
		id: string;
		client_id: string | null;
		kind: string | null;
		flags: Json;
		acknowledged: Bool;
		recorded_at: string | null;
	}[];
	doses: readonly {
		id: string;
		client_id: string | null;
		status: string | null;
		reason: string | null;
		acknowledged: Bool;
		conflict_with: string | null;
		recorded_at: string | null;
		medicationName?: string | null;
	}[];
	coverage: readonly {
		id: string;
		day: string | null;
		shift: string | null;
		status: string | null;
	}[];
	clocks: readonly {
		id: string;
		verified: Bool;
		acknowledged: Bool;
		clock_in_at: string | null;
		staffName?: string | null;
	}[];
	notes: readonly {
		id: string;
		client_id: string | null;
		status: string | null;
		type: string | null;
		author_name: string | null;
		updated_at: string | null;
	}[];
	/** Controlled medication count book entries (domain/controlled.ts) */
	counts?: readonly {
		id: string;
		client_id: string | null;
		medication_id: string | null;
		kind: string | null;
		quantity: number | null;
		expected: number | null;
		discrepancy: Bool;
		witness_name: string | null;
		witness_status: string | null;
		recorded_at: string | null;
		medicationName?: string | null;
	}[];
	/** How long a witness has to countersign, in hours (default 24) */
	countersignHours?: number;
	now?: Date;
}

/** JSON text from the device database (or an array) as a string list. */
export function jsonList(v: Json): string[] {
	if (Array.isArray(v)) return v.map(String);
	if (typeof v !== 'string' || !v) return [];
	try {
		const parsed: unknown = JSON.parse(v);
		return Array.isArray(parsed) ? parsed.map(String) : [];
	} catch {
		return [];
	}
}

const BAND_ORDER: Record<Urgency, number> = { critical: 0, action: 1, info: 2 };
/** charting-ux.md §4.8 attention list order */
const KIND_ORDER: Record<AttentionKind, number> = {
	coverage: 0,
	incident: 1,
	health: 2,
	dose: 3,
	controlled: 4,
	note: 5,
	clock: 6
};

/** Urgency band of an open incident (frontend-spec-3.md §4.1). */
export function incidentUrgency(
	severity: string | null | undefined,
	type: string | null | undefined,
	missing: readonly string[]
): Urgency {
	if (severity === 'High' || type === 'Medication error') return 'critical';
	// Required contacts not marked as told become action items (charting-ux.md §4.7).
	if (severity === 'Low' && !missing.length) return 'info';
	return 'action';
}

/**
 * Everything a supervisor should look at for one home, banded by urgency
 * (frontend-spec-3.md §4.1). Priority is a workflow rule, not a medical
 * assessment. Rows must already be filtered to the selected home.
 */
export function attentionItems(input: AttentionInput): AttentionItem[] {
	const items: AttentionItem[] = [];
	for (const r of input.incidents) {
		if (r.status !== 'open') continue;
		const missing = missingNotifications(
			r.severity,
			r.type,
			jsonList(r.notified_parties),
			input.incidentRules
		);
		items.push({
			kind: 'incident',
			id: r.id,
			clientId: r.client_id,
			urgency: incidentUrgency(r.severity, r.type, missing),
			title: `${r.type ?? 'Incident'}, ${(r.severity ?? 'low').toLowerCase()} severity`,
			detail: missing.length ? `Not yet marked as told: ${missing.join(', ')}` : 'Open report',
			at: r.occurred_at ?? '',
			pill: 'Incident'
		});
	}
	for (const r of input.health) {
		const flags = jsonList(r.flags);
		if (!flags.length || r.acknowledged) continue;
		items.push({
			kind: 'health',
			id: r.id,
			clientId: r.client_id,
			urgency: 'critical',
			title: `${flags.map(flagLabel).join(', ')} outside the normal range`,
			detail: healthKindLabel(r.kind),
			at: r.recorded_at ?? '',
			pill: 'Health'
		});
	}
	for (const r of input.doses) {
		if (r.acknowledged) continue;
		const med = r.medicationName ?? 'Medication';
		if (r.conflict_with) {
			items.push({
				kind: 'dose',
				id: r.id,
				clientId: r.client_id,
				urgency: 'critical',
				title: `${med} may have been recorded twice`,
				detail: 'Check whether the dose was given twice',
				at: r.recorded_at ?? '',
				pill: 'Medication'
			});
		} else if (r.status === 'refused' || r.status === 'held') {
			items.push({
				kind: 'dose',
				id: r.id,
				clientId: r.client_id,
				urgency: 'action',
				title: `${med} ${r.status}`,
				detail: r.reason ?? '',
				at: r.recorded_at ?? '',
				pill: 'Medication'
			});
		}
	}
	for (const c of input.coverage) {
		if (c.status === 'filled' || !c.day || c.day < input.today) continue;
		const searching = c.status === 'searching';
		items.push({
			kind: 'coverage',
			id: c.id,
			clientId: null,
			// Lomi is still offering it: informational. Nobody took it: act.
			urgency: searching ? 'info' : 'action',
			title: `${c.day} ${(c.shift ?? '').toUpperCase()} shift ${searching ? 'is offered to staff' : 'needs cover'}`,
			detail: searching ? 'Lomi is finding cover' : 'No one has accepted it',
			at: c.day,
			pill: 'Coverage'
		});
	}
	for (const n of input.notes) {
		if (n.status !== 'submitted') continue;
		items.push({
			kind: 'note',
			id: n.id,
			clientId: n.client_id,
			urgency: 'action',
			title: `${n.type === 'behavior' ? 'Behavior note' : 'Shift note'} from ${n.author_name ?? 'staff'}`,
			detail: 'Waiting for your review',
			at: n.updated_at ?? '',
			pill: 'Review'
		});
	}
	// The latest count for each controlled medication, if it didn't match, and
	// entries whose witness hasn't countersigned in time.
	const latestCount = new Map<string, NonNullable<AttentionInput['counts']>[number]>();
	for (const c of input.counts ?? []) {
		if (c.kind !== 'count' || !c.medication_id) continue;
		const prior = latestCount.get(c.medication_id);
		if (!prior || (c.recorded_at ?? '') > (prior.recorded_at ?? ''))
			latestCount.set(c.medication_id, c);
	}
	for (const c of latestCount.values()) {
		if (!c.discrepancy) continue;
		items.push({
			kind: 'controlled',
			id: c.id,
			clientId: c.client_id,
			urgency: 'critical',
			title: `${c.medicationName ?? 'Controlled medication'} count doesn’t match`,
			detail: `Counted ${c.quantity}, expected ${c.expected}`,
			at: c.recorded_at ?? '',
			pill: 'Medication'
		});
	}
	const countersignMs = (input.countersignHours ?? 24) * 3_600_000;
	const nowMs = (input.now ?? new Date()).getTime();
	for (const c of input.counts ?? []) {
		if (c.witness_status !== 'pending' || nowMs - Date.parse(c.recorded_at ?? '') <= countersignMs)
			continue;
		items.push({
			kind: 'controlled',
			id: c.id,
			clientId: c.client_id,
			urgency: 'action',
			title: `${c.medicationName ?? 'Controlled medication'} entry not countersigned`,
			detail: `Waiting for ${c.witness_name ?? 'the witness'}`,
			at: c.recorded_at ?? '',
			pill: 'Medication'
		});
	}
	for (const k of input.clocks) {
		if (k.verified || k.acknowledged) continue;
		items.push({
			kind: 'clock',
			id: k.id,
			clientId: null,
			urgency: 'action',
			title: `${k.staffName ?? 'A staff member'} clocked in outside the check-in area`,
			detail: 'Location not verified',
			at: k.clock_in_at ?? '',
			pill: 'Check-in'
		});
	}
	return items.sort(
		(a, b) =>
			BAND_ORDER[a.urgency] - BAND_ORDER[b.urgency] ||
			KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
			a.at.localeCompare(b.at)
	);
}
