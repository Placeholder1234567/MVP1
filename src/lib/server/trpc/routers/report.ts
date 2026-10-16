import { TRPCError } from '@trpc/server';
import {
	exportPayroll,
	PayrollExport,
	exportClinical,
	ClinicalExport
} from '../../services/report/index.ts';
import { featureRoleProcedure, router } from '../middleware.ts';

export const reportRouter = router({
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
