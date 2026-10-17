import { z } from 'zod';
import {
	createGoal,
	createGoalTemplate,
	GoalChanges,
	GoalFilter,
	listGoals,
	listGoalTemplates,
	NewGoal,
	NewGoalTemplate,
	stopGoal,
	TemplateFilter,
	updateGoal
} from '../../services/goal/index.ts';
import { featureProcedure, featureRoleProcedure, router } from '../middleware.ts';

/** Goal procedures specified in trpc-router.md, protected by role/feature middleware. */
export const goalRouter = router({
	create: featureRoleProcedure('goals', 'supervisor')
		.input(NewGoal)
		.mutation(({ ctx, input }) => createGoal(ctx.db, ctx.user.agencyId, ctx.user, input)),
	update: featureRoleProcedure('goals', 'supervisor')
		.input(GoalChanges)
		.mutation(({ ctx, input }) => updateGoal(ctx.db, ctx.user.agencyId, ctx.user, input)),
	stop: featureRoleProcedure('goals', 'supervisor')
		.input(z.strictObject({ id: z.uuid() }))
		.mutation(({ ctx, input }) => stopGoal(ctx.db, ctx.user.agencyId, ctx.user, input.id)),
	list: featureProcedure('goals')
		.input(GoalFilter)
		.query(({ ctx, input }) => listGoals(ctx.db, ctx.user.agencyId, ctx.user, input)),
	listTemplates: featureRoleProcedure('goals', 'supervisor')
		.input(TemplateFilter.default({}))
		.query(({ ctx, input }) => listGoalTemplates(ctx.db, ctx.user.agencyId, ctx.user, input)),
	createTemplate: featureRoleProcedure('goals', 'supervisor')
		.input(NewGoalTemplate)
		.mutation(({ ctx, input }) => createGoalTemplate(ctx.db, ctx.user.agencyId, ctx.user, input))
});
