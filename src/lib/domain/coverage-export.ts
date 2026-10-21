import { csvRows } from './csv';

export type CoverageRow = Record<string, string | number | boolean | null>;
export interface CoverageReport {
	version: 2;
	type: 'coverage';
	homeId: string;
	fromDay: string;
	toDay: string;
	timeZone: string;
	generatedAt: string;
	notificationVisibility: 'agency' | 'own_recipient_only';
	offerEvidenceVisibility: 'selected_home_prospective';
	dateBasis: string;
	evidenceLimits: string;
	rows: CoverageRow[];
}
export const COVERAGE_EVIDENCE_LIMITS =
	'Eligibility is not proof an offer was sent. Offer evidence is prospective only; there is no historical backfill. Queued means recorded for dispatch or in-app sync, provider_accepted is not device delivery, and delivery_reported appears only when a supported provider callback is received. Legacy notification rows still reflect their recorded state and visibility. Missing evidence is unknown, not proof no offer occurred. Staff and home names are current labels, not historical snapshots. Related activity and replies are current records, not a snapshot at the period end.';

export function coverageCsv(report: CoverageReport): string {
	const columns = [
		'kind',
		'id',
		'requestId',
		'homeId',
		'homeName',
		'day',
		'shift',
		'status',
		'calledOutBy',
		'calledOutName',
		'reason',
		'filledBy',
		'filledName',
		'startedAt',
		'filledAt',
		'staffId',
		'staffName',
		'eligible',
		'eligibilityReason',
		'reply',
		'repliedAt',
		'description',
		'occurredAt',
		'channel',
		'event',
		'notificationId',
		'createdAt',
		'sentAt',
		'readAt'
	];
	return csvRows([
		['Coverage log', report.fromDay, report.toDay, report.timeZone],
		['Date basis', report.dateBasis],
		['Notification visibility', report.notificationVisibility],
		['Prospective offer evidence visibility', report.offerEvidenceVisibility],
		['Evidence limits', report.evidenceLimits],
		columns,
		...report.rows.map((row) =>
			columns.map((key) => {
				const value = row[key];
				return typeof value === 'boolean' ? String(value) : value;
			})
		)
	]);
}
