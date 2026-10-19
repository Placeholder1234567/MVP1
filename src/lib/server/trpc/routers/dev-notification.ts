import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { NOTIFICATION_TYPES } from '../../../domain/index.ts';
import { notificationSandboxAllowed } from '../../notification-sandbox.ts';
import { listNotifications, notify } from '../../services/notification/index.ts';
import { roleProcedure, router } from '../middleware.ts';

// Mounted only at the independently guarded development endpoint, never appRouter.
const sandbox = roleProcedure('admin').use(({ next }) => {
	if (!notificationSandboxAllowed(process.env.NODE_ENV !== 'production', process.env))
		throw new TRPCError({ code: 'NOT_FOUND', message: 'Not found' });
	return next();
});
export const devNotificationRouter = router({
	recent: sandbox.query(({ ctx }) =>
		listNotifications(ctx.db, ctx.user.agencyId, ctx.user.profileId, { limit: 50, offset: 0 })
	),
	preview: sandbox
		.input(z.object({ type: z.enum(NOTIFICATION_TYPES) }).strict())
		.mutation(({ ctx, input }) =>
			notify(
				ctx.db,
				ctx.user.agencyId,
				[{ id: ctx.user.profileId, role: ctx.user.role }],
				{
					type: input.type,
					priority: 3,
					title: 'Synthetic notification preview',
					body: 'Synthetic development preview. No care record is referenced.'
				},
				{ preview: true }
			)
		)
});
export type DevNotificationRouter = typeof devNotificationRouter;
