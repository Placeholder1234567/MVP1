import { TRPCError } from '@trpc/server';
import { AgencyChanges, getAgency, updateAgency } from '../../services/agency/index.ts';
import {
	announceMaintenance,
	MaintenanceInput,
	messagingUsage
} from '../../services/notification/index.ts';
import { roleProcedure, router, userProcedure } from '../middleware.ts';

export const agencyRouter = router({
	/** The caller's agency and its configuration (trpc-router.md: agency.get). */
	get: userProcedure.query(async ({ ctx }) => {
		const agency = await getAgency(ctx.db, ctx.user.agencyId);
		if (!agency) throw new TRPCError({ code: 'NOT_FOUND', message: 'Agency not found' });
		// The effective set (tier + overrides + prerequisites) the app uses to
		// hide what the plan doesn't include (entitlements.md §7).
		return { ...agency, features: ctx.user.features };
	}),

	/** Name, charting preset, time zone and settings (admin only; not the plan). */
	update: roleProcedure('admin')
		.input(AgencyChanges)
		.mutation(({ ctx, input }) => updateAgency(ctx.db, ctx.user.agencyId, input)),

	/** Tells every active staff member about a maintenance window (notifications.md §2.18). */
	announceMaintenance: roleProcedure('admin')
		.input(MaintenanceInput)
		.mutation(({ ctx, input }) => announceMaintenance(ctx.db, ctx.user.agencyId, input)),

	/** This month's texts, emails and pushes, the estimated text cost, and who has texts off (admin). */
	messagingUsage: roleProcedure('admin').query(({ ctx }) =>
		messagingUsage(ctx.db, ctx.user.agencyId, ctx.user.timeZone)
	)
});
