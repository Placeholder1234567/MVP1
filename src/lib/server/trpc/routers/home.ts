import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { getHome, listHomes } from '../../services/home/index.ts';
import { router, userProcedure } from '../middleware.ts';

export const homeRouter = router({
	/** Homes the caller can access: caregivers their own, supervisors all (RLS). */
	list: userProcedure.query(({ ctx }) => listHomes(ctx.db, ctx.user.agencyId)),

	get: userProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
		const home = await getHome(ctx.db, ctx.user.agencyId, input.id);
		if (!home) throw new TRPCError({ code: 'NOT_FOUND', message: 'Home not found' });
		return home;
	})
});
