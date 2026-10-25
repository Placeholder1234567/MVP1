// Tells a schedule's owner their report is ready (notifications.md
// report_ready). Report type and dates only: no home, person or contents.
import { CLINICAL_TYPE_LABEL, type ClinicalType } from '../../../domain/clinical-export.ts';
import { withService } from '../../db';
import type { CurrentUser } from '../auth/index.ts';
import { notify } from '../notification/index.ts';

export async function scheduledReportReady(
	user: Pick<CurrentUser, 'agencyId' | 'profileId' | 'role'>,
	reportId: string,
	input: { type: ClinicalType; fromDay: string; toDay: string }
) {
	try {
		await withService((tx) =>
			notify(tx, user.agencyId, [{ id: user.profileId, role: user.role }], {
				type: 'report_ready',
				priority: 3,
				title: `Your scheduled report is ready: ${CLINICAL_TYPE_LABEL[input.type]}, ${input.fromDay} to ${input.toDay}`,
				referenceId: reportId,
				referenceType: 'report_jobs'
			})
		);
	} catch (e) {
		// The report itself is ready and listed on the Reports page; a lost
		// alert must not fail it.
		console.error(`report_ready notify failed: ${(e as Error).name}`);
	}
}
