import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
	archiveHome,
	createHome,
	getHome,
	HomeChanges,
	listHomes,
	NewHome,
	restoreHome,
	updateHome
} from '../../services/home/index.ts';
import { roleProcedure, router, userProcedure } from '../middleware.ts';

export const homeRouter = router({
	/** Homes the caller can access: caregivers their own, supervisors all (RLS). */
	list: userProcedure.query(({ ctx }) => listHomes(ctx.db, ctx.user.agencyId)),

	get: userProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
		const home = await getHome(ctx.db, ctx.user.agencyId, input.id);
		if (!home) throw new TRPCError({ code: 'NOT_FOUND', message: 'Home not found' });
		return home;
	}),

	create: roleProcedure('admin')
		.input(NewHome)
		.mutation(({ ctx, input }) => createHome(ctx.db, ctx.user.agencyId, input)),

	update: roleProcedure('admin')
		.input(HomeChanges)
		.mutation(({ ctx, input }) => updateHome(ctx.db, ctx.user.agencyId, input)),

	/** A home that has closed: records stay, read-only. Refused while in use. */
	archive: roleProcedure('admin')
		.input(z.object({ id: z.uuid() }))
		.mutation(({ ctx, input }) =>
			archiveHome(ctx.db, ctx.user.agencyId, input.id, ctx.user.timeZone)
		),

	restore: roleProcedure('admin')
		.input(z.object({ id: z.uuid() }))
		.mutation(({ ctx, input }) => restoreHome(ctx.db, ctx.user.agencyId, input.id))
});
