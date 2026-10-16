import { csvRows } from './csv';

/** Exports intentionally exclude coordinates, correction reasons and client records. */
export interface PayrollEntry {
	id: string;
	staffId: string;
	homeId: string;
	staffName?: string;
	homeName?: string;
	clockIn: string;
	clockOut: string | null;
	hours: number;
	locationVerified: boolean;
	manual: boolean;
	acknowledged: boolean;
}
export interface PayrollReport {
	version: 1;
	from: string;
	to: string;
	generatedAt: string;
	totals: {
		totalHours: number;
		verifiedHours: number;
		unverifiedHours: number;
		manualHours: number;
	};
	entries: PayrollEntry[];
}
export function payrollCsv(report: PayrollReport): string {
	return (
		'\uFEFF' +
		csvRows([
			[
				'Record ID',
				'Staff ID',
				'Home ID',
				'Staff',
				'Home',
				'Clock in (UTC)',
				'Clock out (UTC)',
				'Hours in report period',
				'Location verified',
				'Manual entry',
				'Acknowledged',
				'Period from (UTC)',
				'Period to (UTC)'
			],
			...report.entries.map((r) => [
				r.id,
				r.staffId,
				r.homeId,
				r.staffName ?? '',
				r.homeName ?? '',
				r.clockIn,
				r.clockOut ?? '',
				r.hours,
				r.locationVerified ? 'Yes' : 'No',
				r.manual ? 'Yes' : 'No',
				r.acknowledged ? 'Yes' : 'No',
				report.from,
				report.to
			])
		])
	);
}
