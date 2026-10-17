import { WeeklyInput, weeklyAnalytics } from '../../services/analytics/index.ts';
import { featureRoleProcedure, router } from '../middleware.ts';

// frontend-spec-3.md §4.4: supervisors and admins on plans with analytics.
export const analyticsRouter = router({
	/** Every weekly measure the analytics screen draws, in one call. */
	weekly: featureRoleProcedure('analytics', 'supervisor')
		.input(WeeklyInput.partial().optional())
		.query(({ ctx, input }) =>
			weeklyAnalytics(ctx.db, ctx.user.agencyId, ctx.user.timeZone, input ?? {})
		)
});
