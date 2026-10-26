import { TRPCError } from '@trpc/server';
import {
	exportPayroll,
	PayrollExport,
	exportClinical,
	ClinicalExport,
	PersonRecordExport,
	CoverageExport,
	exportCoverage,
	BackgroundRequest,
	BackgroundId,
	BackgroundRecent,
	requestBackground,
	backgroundStatus,
	recentBackground,
	downloadBackground,
	createReportSchedule,
	deleteReportSchedule,
	listReportSchedules,
	resumeReportSchedule,
	NewReportSchedule,
	ReportScheduleId
} from '../../services/report/index.ts';
import { featureRoleProcedure, roleProcedure, router } from '../middleware.ts';

// Scheduled reports: Complete plan (`reports_scheduled`), each person's own.
const scheduler = featureRoleProcedure('reports_scheduled', 'supervisor');

export const reportRouter = router({
	schedules: scheduler.query(({ ctx }) => listReportSchedules(ctx.db, ctx.user)),
	createSchedule: scheduler
		.input(NewReportSchedule)
		.mutation(({ ctx, input }) => createReportSchedule(ctx.db, ctx.user, input)),
	deleteSchedule: scheduler
		.input(ReportScheduleId)
		.mutation(({ ctx, input }) => deleteReportSchedule(ctx.db, ctx.user, input)),
	resumeSchedule: scheduler
		.input(ReportScheduleId)
		.mutation(({ ctx, input }) => resumeReportSchedule(ctx.db, ctx.user, input)),
	exportCoverage: featureRoleProcedure(['reports_basic', 'reports'], 'supervisor')
		.input(CoverageExport)
		.mutation(({ ctx, input }) => exportCoverage(ctx.db, ctx.user, input, ctx.request)),
	recentBackground: featureRoleProcedure('reports', 'supervisor')
		.input(BackgroundRecent)
		.mutation(({ ctx, input }) => recentBackground(ctx.db, ctx.user, input)),
	requestBackground: featureRoleProcedure('reports', 'supervisor')
		.input(BackgroundRequest)
		.mutation(({ ctx, input }) => requestBackground(ctx.db, ctx.user, input)),
	backgroundStatus: featureRoleProcedure('reports', 'supervisor')
		.input(BackgroundId)
		.mutation(({ ctx, input }) => backgroundStatus(ctx.db, ctx.user, input)),
	downloadBackground: featureRoleProcedure('reports', 'supervisor')
		.input(BackgroundId)
		.mutation(({ ctx, input }) => downloadBackground(ctx.db, ctx.user, input, ctx.request)),
	exportClinical: featureRoleProcedure('reports', 'supervisor')
		.input(ClinicalExport)
		.mutation(({ ctx, input }) => exportClinical(ctx.db, ctx.user, input, ctx.request)),
	// One person's record for a right-of-access request: admins, every plan.
	exportPersonRecord: roleProcedure('admin')
		.input(PersonRecordExport)
		.mutation(({ ctx, input }) =>
			exportClinical(ctx.db, ctx.user, input, ctx.request, { rightOfAccess: true })
		),
	// A mutation keeps report parameters out of query URLs and audits every export.
	exportTimesheet: featureRoleProcedure(['reports_basic', 'reports'], 'supervisor')
		.input(PayrollExport)
		.mutation(({ ctx, input }) => {
			if (!ctx.user.features.includes('timekeeping'))
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'This feature is not included in your agency’s plan'
				});
			return exportPayroll(ctx.db, ctx.user, input, ctx.request);
		})
});
