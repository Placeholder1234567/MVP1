import { z } from 'zod';
import { payrollCsv, type PayrollReport } from '../../../domain/timesheet-export';
import { asService, type Tx, type RequestInfo } from '../../db';
import type { CurrentUser } from '../auth/index.ts';
import { timesheet } from '../clock/index.ts';
import { recordExport, payrollLabels } from './report.queries';
export { ClinicalExport, exportClinical } from './clinical';
export {
	BackgroundRequest,
	BackgroundId,
	requestBackground,
	backgroundStatus,
	downloadBackground,
	generateCareReport
} from './background';

export const PayrollExport = z.object({
	homeId: z.uuid().optional(),
	profileId: z.uuid().optional(),
	from: z.coerce.date(),
	to: z.coerce.date(),
	format: z.enum(['csv', 'json'])
});

export async function exportPayroll(
	tx: Tx,
	user: CurrentUser,
	input: z.input<typeof PayrollExport>,
	request: RequestInfo
) {
	const p = PayrollExport.parse(input);
	const result = await timesheet(tx, user, p);
	const labels = await payrollLabels(
		tx,
		user.agencyId,
		[...new Set(result.entries.map((r) => r.profile_id))],
		[...new Set(result.entries.map((r) => r.home_id))]
	);
	const report: PayrollReport = {
		version: 1,
		from: p.from.toISOString(),
		to: p.to.toISOString(),
		generatedAt: new Date().toISOString(),
		totals: {
			totalHours: result.totalHours,
			verifiedHours: result.verifiedHours,
			unverifiedHours: result.unverifiedHours,
			manualHours: result.manualHours
		},
		entries: result.entries.map((r) => ({
			id: r.id,
			staffId: r.profile_id,
			homeId: r.home_id,
			staffName: labels.staff.get(r.profile_id) ?? '',
			homeName: labels.homes.get(r.home_id) ?? '',
			clockIn: r.clock_in_at.toISOString(),
			clockOut: r.clock_out_at?.toISOString() ?? null,
			hours: r.clock_out_at
				? Math.max(
						0,
						Math.min(r.clock_out_at.getTime(), p.to.getTime()) -
							Math.max(r.clock_in_at.getTime(), p.from.getTime())
					) / 3600000
				: 0,
			locationVerified: r.verified,
			manual: r.manual_override,
			acknowledged: r.acknowledged
		}))
	};
	const content = p.format === 'csv' ? payrollCsv(report) : JSON.stringify(report, null, 2);
	// Elevation is restricted to this append-only audit insert, never report reads.
	await asService(tx, (t) =>
		recordExport(t, user.agencyId, user.profileId, p.format, report.entries.length, request)
	);
	return {
		content,
		filename: `guad-timesheet.${p.format}`,
		contentType: p.format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8',
		rows: report.entries.length
	};
}
