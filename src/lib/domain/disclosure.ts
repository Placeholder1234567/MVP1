// Accounting of disclosures (HIPAA 45 CFR 164.528; research/product-2026-10.md
// §E). A person or their guardian may ask what was shared about them outside
// care, payment and the agency's own operations in the last six years. The
// agency answers within 60 days (one 30-day extension). Each entry gives the
// date, who received it (and their address if known), what was shared, and
// why. Not accountable, so never listed: treatment, payment, operations,
// disclosures to the person or guardian, to family involved in care, or
// under the person's signed authorization.
import { MANDATED_REPORT_TYPES, type IncidentType } from './charting';
import { csvRows } from './csv';
import { addDays } from './time';

export const DISCLOSURE_PURPOSES = [
	'abuse_report',
	'state_incident_report',
	'health_oversight',
	'court',
	'law_enforcement',
	'coroner',
	'public_health',
	'serious_threat',
	'research',
	'other_required'
] as const;
export type DisclosurePurpose = (typeof DISCLOSURE_PURPOSES)[number];

/** Plain words for each purpose, with the rule that allows it (164.512). */
export const DISCLOSURE_PURPOSE_LABEL: Record<DisclosurePurpose, string> = {
	abuse_report: 'Report of abuse, neglect or exploitation (APS or state hotline)',
	state_incident_report: 'Incident report to the state, required by law',
	health_oversight: 'Health oversight (state survey, licensing, Medicaid audit)',
	court: 'Court order or subpoena',
	law_enforcement: 'Law enforcement',
	coroner: 'Coroner or medical examiner',
	public_health: 'Public health report',
	serious_threat: 'To prevent a serious threat to health or safety',
	research: 'Research without the person’s authorization',
	other_required: 'Other disclosure required by law'
};

/** How far back an accounting reaches. */
export const ACCOUNTING_YEARS = 6;

/** First day covered by an accounting given on `today` (YYYY-MM-DD). */
export function accountingFrom(today: string): string {
	const [y, m, d] = today.split('-').map(Number);
	const back = `${String(y - ACCOUNTING_YEARS).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
	// 29 February six years back may not exist; the day after is still in range.
	return m === 2 && d === 29 ? addDays(back.replace(/-29$/, '-28'), 1) : back;
}

export interface AccountingEntry {
	/** YYYY-MM-DD */
	date: string;
	recipient: string;
	address: string | null;
	description: string;
	purpose: DisclosurePurpose;
	detail: string | null;
	/** Recorded by hand, or taken from an incident report marked as sent to the state */
	source: 'recorded' | 'incident';
	recordedBy: string | null;
}

/** The notified party on an incident that means the state was sent the report. */
export const STATE_REPORT_PARTY = 'State reporting system';

/** An incident report sent to the state, as an accounting entry. */
export function incidentDisclosure(incident: {
	day: string;
	type: IncidentType;
	authorName: string | null;
}): AccountingEntry {
	const abuse = MANDATED_REPORT_TYPES.includes(incident.type);
	return {
		date: incident.day,
		recipient: 'State incident reporting system',
		address: null,
		description: `Incident report (${incident.type})`,
		purpose: abuse ? 'abuse_report' : 'state_incident_report',
		detail: null,
		source: 'incident',
		recordedBy: incident.authorName
	};
}

/** Newest first; same day keeps recorded entries before incident ones. */
export function sortAccounting(entries: AccountingEntry[]): AccountingEntry[] {
	return [...entries].sort(
		(a, b) => b.date.localeCompare(a.date) || b.source.localeCompare(a.source)
	);
}

/** The accounting as CSV, with a short heading block. */
export function accountingCsv(
	person: string,
	from: string,
	to: string,
	entries: AccountingEntry[]
): string {
	return csvRows([
		['Accounting of disclosures', person],
		['Period', `${from} to ${to}`],
		[
			'Not listed (not required): disclosures for treatment, payment or health care operations, to the person or their representative, to family involved in care, or under the person’s signed authorization.'
		],
		[],
		[
			'Date',
			'Recipient',
			'Recipient address',
			'What was disclosed',
			'Purpose',
			'Request or order',
			'Recorded by'
		],
		...entries.map((e) => [
			e.date,
			e.recipient,
			e.address,
			e.description,
			DISCLOSURE_PURPOSE_LABEL[e.purpose],
			e.detail,
			e.source === 'incident' ? `${e.recordedBy ?? 'Staff'} (incident report)` : e.recordedBy
		])
	]);
}
