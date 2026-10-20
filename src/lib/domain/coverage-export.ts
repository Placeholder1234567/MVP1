import { csvRows } from './csv';

export type CoverageRow = Record<string, string | number | boolean | null>;
export interface CoverageReport {
	version: 1;
	type: 'coverage';
	homeId: string;
	fromDay: string;
	toDay: string;
	timeZone: string;
	generatedAt: string;
	notificationVisibility: 'agency' | 'own_recipient_only';
	dateBasis: string;
	evidenceLimits: string;
	rows: CoverageRow[];
}
export const COVERAGE_EVIDENCE_LIMITS =
	'Eligibility is not proof an offer was sent. Notification rows describe recorded channel state, not guaranteed delivery. Missing notification evidence is unknown, not proof no offer occurred. Staff and home names are current labels, not historical snapshots. Related activity and replies are current records, not a snapshot at the period end.';

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
		'createdAt',
		'sentAt',
		'readAt'
	];
	return csvRows([
		['Coverage log', report.fromDay, report.toDay, report.timeZone],
		['Date basis', report.dateBasis],
		['Notification visibility', report.notificationVisibility],
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
