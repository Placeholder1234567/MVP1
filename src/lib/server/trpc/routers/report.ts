import { TRPCError } from '@trpc/server';
import {
	exportPayroll,
	PayrollExport,
	exportClinical,
	ClinicalExport,
	CoverageExport,
	exportCoverage,
	BackgroundRequest,
	BackgroundId,
	BackgroundRecent,
	requestBackground,
	backgroundStatus,
	recentBackground,
	downloadBackground
} from '../../services/report/index.ts';
import { featureRoleProcedure, router } from '../middleware.ts';

export const reportRouter = router({
	exportCoverage: featureRoleProcedure('reports', 'supervisor')
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
