// Tells a schedule's owner their report is ready (notifications.md
// report_ready). Report type and dates only: no home, person or contents.
import { CLINICAL_TYPE_LABEL, type ClinicalType } from '../../../domain/clinical-export.ts';
import { withService } from '../../db';
import type { CurrentUser } from '../auth/index.ts';
import { notify } from '../notification/index.ts';
import { ownerRole } from './schedule.queries';

type Report = { type: ClinicalType; fromDay: string; toDay: string };

export function scheduledReportReady(
	user: Pick<CurrentUser, 'agencyId' | 'profileId'>,
	reportId: string,
	input: Report
) {
	return tell(user, reportId, `Your scheduled report is ready: ${describe(input)}`);
}

/** Also when it could not be built, so nobody waits for a report that won't come. */
export function scheduledReportFailed(
	user: Pick<CurrentUser, 'agencyId' | 'profileId'>,
	reportId: string,
	input: Report
) {
	return tell(
		user,
		reportId,
		`Your scheduled report could not be built: ${describe(input)}. Download it by hand from Reports.`
	);
}

const describe = (r: Report) => `${CLINICAL_TYPE_LABEL[r.type]}, ${r.fromDay} to ${r.toDay}`;

async function tell(
	user: Pick<CurrentUser, 'agencyId' | 'profileId'>,
	reportId: string,
	title: string
) {
	try {
		await withService(async (tx) => {
			const role = await ownerRole(tx, user.agencyId, user.profileId);
			if (!role) return;
			await notify(tx, user.agencyId, [{ id: user.profileId, role }], {
				type: 'report_ready',
				priority: 3,
				title,
				referenceId: reportId,
				referenceType: 'report_jobs'
			});
		});
	} catch (e) {
		// The report's own state is already saved; a lost alert must not change it.
		console.error(`report_ready notify failed: ${(e as Error).name}`);
	}
}
