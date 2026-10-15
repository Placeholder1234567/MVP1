import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
	acknowledgeDose,
	listMar,
	listMedications,
	recordDose,
	recordEffect
} from '../../services/medication/index.ts';
import { roleProcedure, router, userProcedure } from '../middleware.ts';

const range = z.object({ from: z.iso.date(), to: z.iso.date() });

export const marRouter = router({
	/**
	 * Records a dose. A duplicate scheduled slot is kept as a conflict record
	 * and supervisors are alerted, the same as for offline uploads.
	 */
	record: userProcedure
		.input(
			z.object({
				id: z.uuid().optional(),
				clientId: z.uuid(),
				medicationId: z.uuid(),
				day: z.iso.date(),
				scheduledTime: z.string().nullish(),
				status: z.enum(['given', 'refused', 'held']),
				reason: z.string().nullish(),
				amendsId: z.uuid().nullish()
			})
		)
		.mutation(async ({ ctx, input }) => {
			const id = input.id ?? randomUUID();
			const result = await recordDose(ctx.db, ctx.user.agencyId, ctx.user, { ...input, id });
			return { id, ...result };
		}),

	recordEffect: userProcedure
		.input(z.object({ id: z.uuid(), effect: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const { updatedAt } = await recordEffect(
				ctx.db,
				ctx.user.agencyId,
				ctx.user,
				input.id,
				input.effect
			);
			return { id: input.id, effect: input.effect.trim(), updatedAt };
		}),

	list: userProcedure
		.input(
			z.object({ clientId: z.uuid(), day: z.iso.date().optional(), dateRange: range.optional() })
		)
		.query(({ ctx, input }) =>
			listMar(
				ctx.db,
				ctx.user.agencyId,
				ctx.user,
				input.clientId,
				input.dateRange ?? (input.day ? { from: input.day, to: input.day } : undefined)
			)
		),

	acknowledge: roleProcedure('supervisor')
		.input(z.object({ id: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			const { updatedAt } = await acknowledgeDose(ctx.db, ctx.user.agencyId, ctx.user, input.id);
			return { id: input.id, acknowledged: true as const, updatedAt };
		})
});

export const medicationRouter = router({
	list: userProcedure
		.input(z.object({ clientId: z.uuid(), includeStopped: z.boolean().default(false) }))
		.query(({ ctx, input }) =>
			listMedications(ctx.db, ctx.user.agencyId, input.clientId, input.includeStopped)
		)
});
