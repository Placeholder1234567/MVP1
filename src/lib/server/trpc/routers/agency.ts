import { TRPCError } from '@trpc/server';
import { getAgency } from '../../services/agency/index.ts';
import { router, userProcedure } from '../middleware.ts';

export const agencyRouter = router({
	/** The caller's agency and its configuration (trpc-router.md: agency.get). */
	get: userProcedure.query(async ({ ctx }) => {
		const agency = await getAgency(ctx.db, ctx.user.agencyId);
		if (!agency) throw new TRPCError({ code: 'NOT_FOUND', message: 'Agency not found' });
		return agency;
	})
});
