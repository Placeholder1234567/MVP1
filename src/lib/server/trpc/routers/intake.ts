import { z } from 'zod';
import * as intake from '../../services/intake/index.ts';
import { featureRoleProcedure, router } from '../middleware.ts';
const status = z.enum(['inquiry', 'touring', 'accepted', 'waitlist', 'declined', 'placed']);
const roomStatus = z.enum(['available', 'occupied', 'reserved']);
const details = z.object({
	contactName: z.string().trim().max(200).optional(),
	contactPhone: z.string().trim().max(50).optional(),
	contactEmail: z.union([z.email(), z.literal('')]).optional(),
	notes: z.string().max(8000).optional()
});
const supervisor = featureRoleProcedure('intake', 'supervisor');
export const intakeRouter = router({
	createReferral: supervisor
		.input(
			details.extend({
				clientName: z.string().trim().max(200).optional(),
				source: z.string().trim().max(200).optional()
			})
		)
		.mutation(({ ctx, input }) =>
			intake.createReferral(ctx.db, ctx.user.agencyId, ctx.user.profileId, input)
		),
	listReferrals: supervisor
		.input(
			z
				.object({
					status: status.optional(),
					limit: z.number().int().min(1).max(100).default(50),
					offset: z.number().int().min(0).max(100000).default(0)
				})
				.default({ limit: 50, offset: 0 })
		)
		.query(({ ctx, input }) => intake.listReferrals(ctx.db, ctx.user.agencyId, input)),
	getReferral: supervisor
		.input(z.object({ id: z.uuid() }))
		.query(({ ctx, input }) => intake.getReferral(ctx.db, ctx.user.agencyId, input.id)),
	updateReferral: supervisor
		.input(
			details.extend({
				id: z.uuid(),
				status: status.optional(),
				assignedHomeId: z.uuid().optional()
			})
		)
		.mutation(({ ctx, input }) => intake.updateReferral(ctx.db, ctx.user.agencyId, input)),
	convertToClient: supervisor
		.input(
			z.object({
				referralId: z.uuid(),
				homeId: z.uuid(),
				name: z.string().trim().min(1).max(200),
				firstName: z.string().trim().max(100).optional(),
				roomId: z.uuid().optional()
			})
		)
		.mutation(({ ctx, input }) => intake.convertToClient(ctx.db, ctx.user.agencyId, input)),
	listRooms: supervisor
		.input(z.object({ homeId: z.uuid().optional(), status: roomStatus.optional() }).default({}))
		.query(({ ctx, input }) => intake.listRooms(ctx.db, ctx.user.agencyId, input)),
	updateRoom: supervisor
		.input(
			z.object({
				id: z.uuid(),
				status: roomStatus.optional(),
				occupiedBy: z.uuid().nullable().optional()
			})
		)
		.mutation(({ ctx, input }) => intake.updateRoom(ctx.db, ctx.user.agencyId, input))
});
