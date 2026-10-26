// Scheduled care reports (Complete plan, `reports_scheduled`;
// domain/report-schedule.ts). A supervisor saves a report to be built every
// week or month for one of their homes. The daily sweep builds it as them,
// through the same background queue and checks as "Prepare a larger care
// report", for the period just ended, and alerts them when it is ready
// (report_ready, no PHI). The file is kept 7 days and listed with their
// other background reports. When the owner can no longer have the report
// (left, lost the home or role, plan changed), the schedule is switched off.
import { z } from 'zod';
import { CLINICAL_TYPES } from '../../../domain/clinical-export.ts';
import {
	addDays,
	localTime,
	MAX_SCHEDULES,
	nextRunDay,
	REPORT_FREQUENCIES,
	REPORT_RUN_HOUR,
	reportPeriod,
	SCHEDULED_FORMATS,
	type ReportFrequency
} from '../../../domain/index.ts';
import { asService, withService, withUser, type Tx } from '../../db';
import { ServiceError } from '../../errors';
import { getCurrentUser, type CurrentUser } from '../auth/index.ts';
import { careReportAccess, queueCareReport } from './background';
import { requesterUid } from './background.queries';
import {
	claimRun,
	deleteOwnSchedule,
	dueSchedules,
	finishRun,
	insertSchedule,
	reactivateSchedule,
	releaseRun,
	selectOwnSchedules
} from './schedule.queries';

export const NewReportSchedule = z.object({
	homeId: z.uuid(),
	type: z.enum(CLINICAL_TYPES),
	format: z.enum(SCHEDULED_FORMATS),
	frequency: z.enum(REPORT_FREQUENCIES),
	weekday: z.number().int().min(1).max(7).default(1),
	approvedOnly: z.boolean().default(false)
});
export const ReportScheduleId = z.object({ id: z.uuid() });

export function listReportSchedules(tx: Tx, user: CurrentUser) {
	return selectOwnSchedules(tx, user.agencyId, user.profileId);
}

export async function createReportSchedule(
	tx: Tx,
	user: CurrentUser,
	input: z.input<typeof NewReportSchedule>
) {
	const s = NewReportSchedule.parse(input);
	const own = await selectOwnSchedules(tx, user.agencyId, user.profileId);
	if (own.filter((x) => x.active).length >= MAX_SCHEDULES)
		throw new ServiceError(
			'RULE_VIOLATION',
			`You can have up to ${MAX_SCHEDULES} scheduled reports. Remove one first.`
		);
	const today = localTime(new Date(), user.timeZone).day;
	const next = nextRunDay(s.frequency, s.weekday, today);
	// The same checks a report for the first period would get now.
	await careReportAccess(tx, user, {
		type: s.type,
		homeId: s.homeId,
		format: s.format,
		approvedOnly: s.approvedOnly,
		...reportPeriod(s.frequency, next)
	});
	return insertSchedule(tx, {
		agency_id: user.agencyId,
		profile_id: user.profileId,
		home_id: s.homeId,
		type: s.type,
		format: s.format,
		frequency: s.frequency,
		weekday: s.weekday,
		approved_only: s.approvedOnly,
		next_run_on: next
	});
}

export async function deleteReportSchedule(
	tx: Tx,
	user: CurrentUser,
	input: z.input<typeof ReportScheduleId>
) {
	const { id } = ReportScheduleId.parse(input);
	if (!(await deleteOwnSchedule(tx, user.agencyId, user.profileId, id)))
		throw new ServiceError('NOT_FOUND', 'Scheduled report not found');
	return { id };
}

/**
 * Turns a stopped schedule back on (after the owner got their access back),
 * with the same checks as a new one. It runs next on its next day from today.
 */
export async function resumeReportSchedule(
	tx: Tx,
	user: CurrentUser,
	input: z.input<typeof ReportScheduleId>
) {
	const { id } = ReportScheduleId.parse(input);
	const own = await selectOwnSchedules(tx, user.agencyId, user.profileId);
	const s = own.find((x) => x.id === id);
	if (!s) throw new ServiceError('NOT_FOUND', 'Scheduled report not found');
	if (s.active) return s;
	if (own.filter((x) => x.active).length >= MAX_SCHEDULES)
		throw new ServiceError(
			'RULE_VIOLATION',
			`You can have up to ${MAX_SCHEDULES} scheduled reports running. Remove one first.`
		);
	const frequency = s.frequency as ReportFrequency;
	const next = nextRunDay(frequency, s.weekday, localTime(new Date(), user.timeZone).day);
	await careReportAccess(tx, user, {
		type: s.type as (typeof CLINICAL_TYPES)[number],
		homeId: s.homeId,
		format: s.format as (typeof SCHEDULED_FORMATS)[number],
		approvedOnly: s.approvedOnly,
		...reportPeriod(frequency, next)
	});
	// Owners can't update schedules under RLS; the sweep's own columns change here.
	return asService(tx, (t) => reactivateSchedule(t, user.agencyId, user.profileId, id, next));
}

type Due = Awaited<ReturnType<typeof dueSchedules>>[number];

/** report-schedule-sweep: builds every report whose day has come in its agency. */
export async function sweepReportSchedules(now = new Date()) {
	// No agency is more than a day ahead of UTC.
	const latest = addDays(now.toISOString().slice(0, 10), 1);
	const due = await withService((tx) => dueSchedules(tx, latest, 500));
	let queued = 0;
	for (const s of due) {
		try {
			if (await runSchedule(s, now)) queued++;
		} catch (e) {
			// IDs only; the next sweep tries again unless the run was claimed.
			console.error(`report schedule ${s.id} failed: ${(e as Error).name}`);
		}
	}
	return { due: due.length, queued };
}

async function runSchedule(s: Due, now: Date): Promise<boolean> {
	const local = localTime(now, s.timeZone);
	const today = local.day;
	// Not before the overnight shift has ended and its records had time to sync.
	if (s.nextRunOn > today || (s.nextRunOn === today && local.hour < REPORT_RUN_HOUR)) return false;
	const frequency = s.frequency as ReportFrequency;
	// The period of the day it was due, even when the sweep runs late.
	const period = reportPeriod(frequency, s.nextRunOn);
	const next = nextRunDay(frequency, s.weekday, today);
	if (!(await withService((tx) => claimRun(tx, s.id, s.nextRunOn, next, today)))) return false;
	let reportId: string | null = null;
	try {
		const uid = await withService((tx) => requesterUid(tx, s.agencyId, s.profileId));
		const user = uid ? await getCurrentUser(uid) : null;
		if (
			user &&
			user.agencyId === s.agencyId &&
			user.profileId === s.profileId &&
			user.features.includes('reports_scheduled')
		) {
			const queued = await withUser(user.claims, {}, (tx) =>
				queueCareReport(
					tx,
					user,
					{
						type: s.type as (typeof CLINICAL_TYPES)[number],
						homeId: s.homeId,
						format: s.format as (typeof SCHEDULED_FORMATS)[number],
						approvedOnly: s.approvedOnly,
						...period
					},
					{ minutes: 60, scheduleId: s.id }
				)
			);
			reportId = queued.id;
		}
	} catch (e) {
		if (!(e instanceof ServiceError)) {
			// Not a lost permission (a database blip, say): put the run back
			// for the next sweep instead of skipping this period.
			await withService((tx) => releaseRun(tx, s.id, next, s.nextRunOn, s.lastRunOn));
			throw e;
		}
	}
	await withService((tx) => finishRun(tx, s.id, reportId ? { reportId } : { inactive: true }));
	return !!reportId;
}
