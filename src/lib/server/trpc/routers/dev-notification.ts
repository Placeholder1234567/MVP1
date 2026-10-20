import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { NOTIFICATION_TYPES } from '../../../domain/index.ts';
import { notificationSandboxAllowed } from '../../notification-sandbox.ts';
import {
	developmentNotificationHistory,
	isSyntheticNotificationEvent,
	notify
} from '../../services/notification/index.ts';
import { localNotificationTasks, fireLocalNotificationTask } from '../../jobs/queue.ts';
import type { Tx } from '../../db';
import { roleProcedure, router } from '../middleware.ts';

// Mounted only at the independently guarded development endpoint, never appRouter.
const sandbox = roleProcedure('admin').use(({ next }) => {
	if (!notificationSandboxAllowed(process.env.NODE_ENV !== 'production', process.env))
		throw new TRPCError({ code: 'NOT_FOUND', message: 'Not found' });
	return next();
});
const taskPayload = z.object({
	agencyId: z.uuid(),
	notificationId: z.uuid(),
	referenceId: z.uuid(),
	type: z.enum(NOTIFICATION_TYPES),
	step: z.number().int().min(1).max(10)
});
async function accessibleTasks(tx: Tx, agencyId: string) {
	const result = [];
	for (const task of localNotificationTasks()) {
		const parsed = taskPayload.safeParse(task.payload);
		if (!parsed.success || parsed.data.agencyId !== agencyId) continue;
		if (
			!(await isSyntheticNotificationEvent(
				tx,
				agencyId,
				parsed.data.notificationId,
				parsed.data.referenceId
			))
		)
			continue;
		result.push({
			id: task.id,
			job: task.job,
			type: parsed.data.type,
			step: parsed.data.step,
			scheduledAt: new Date(task.scheduledAt)
		});
		if (result.length === 100) break;
	}
	return result;
}
export const devNotificationRouter = router({
	pendingTasks: sandbox.query(({ ctx }) => accessibleTasks(ctx.db, ctx.user.agencyId)),
	fireTask: sandbox
		.input(z.object({ id: z.uuid(), confirm: z.literal(true) }).strict())
		.mutation(async ({ ctx, input }) => {
			if (!(await accessibleTasks(ctx.db, ctx.user.agencyId)).some((task) => task.id === input.id))
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
			return { outcome: await fireLocalNotificationTask(input.id) };
		}),
	recent: sandbox
		.input(
			z
				.object({ scope: z.enum(['mine', 'agency']).default('mine') })
				.strict()
				.optional()
		)
		.query(({ ctx, input }) =>
			developmentNotificationHistory(
				ctx.db,
				ctx.user.agencyId,
				input?.scope === 'agency' ? undefined : ctx.user.profileId
			)
		),
	sendTest: sandbox
		.input(z.object({ type: z.enum(NOTIFICATION_TYPES), confirm: z.literal(true) }).strict())
		.mutation(async ({ ctx, input }) => ({
			deliveriesQueued: await notify(
				ctx.db,
				ctx.user.agencyId,
				[{ id: ctx.user.profileId, role: ctx.user.role }],
				{
					type: input.type,
					priority: 3,
					title: 'Synthetic development notification',
					body: 'Synthetic test delivery. No care record is referenced.',
					referenceId: randomUUID(),
					referenceType: 'development_test'
				}
			)
		})),
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
