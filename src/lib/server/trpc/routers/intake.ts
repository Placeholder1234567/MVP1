import { z } from 'zod';
import * as intake from '../../services/intake/index.ts';
import { featureRoleProcedure, router } from '../middleware.ts';
const status = z.enum(['inquiry', 'touring', 'accepted', 'waitlist', 'declined', 'placed']);
const roomStatus = z.enum(['available', 'occupied', 'reserved']);
const details = z.object({
	contactName: z.string().trim().max(200).optional(),
	contactPhone: z.string().trim().max(50).optional(),
	contactEmail: z.union([z.email(), z.literal('')]).optional(),
	notes: z.string().max(8000).optional(),
	placementNeeds: z
		.object({ medicationCertifiedStaff: z.enum(['unknown', 'required', 'not_required']) })
		.strict()
		.optional()
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
		.query(({ ctx, input }) =>
			intake.getReferral(ctx.db, ctx.user.agencyId, input.id, ctx.user.profileId)
		),
	updateReferral: supervisor
		.input(
			details.extend({
				id: z.uuid(),
				status: status.optional(),
				assignedHomeId: z.uuid().optional()
			})
		)
		.mutation(({ ctx, input }) =>
			intake.updateReferral(ctx.db, ctx.user.agencyId, input, ctx.user.profileId)
		),
	addReferralNote: supervisor
		.input(z.object({ referralId: z.uuid(), body: z.string().trim().min(1).max(4000) }))
		.mutation(({ ctx, input }) =>
			intake.addReferralNote(
				ctx.db,
				ctx.user.agencyId,
				{ profileId: ctx.user.profileId, name: ctx.user.name },
				input
			)
		),
	listReferralNotes: supervisor
		.input(z.object({ referralId: z.uuid() }))
		.query(({ ctx, input }) =>
			intake.listReferralNotes(ctx.db, ctx.user.agencyId, input.referralId)
		),
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
		.mutation(({ ctx, input }) =>
			intake.convertToClient(ctx.db, ctx.user.agencyId, input, ctx.user.profileId)
		),
	listRooms: supervisor
		.input(z.object({ homeId: z.uuid().optional(), status: roomStatus.optional() }).default({}))
		.query(({ ctx, input }) => intake.listRooms(ctx.db, ctx.user.agencyId, input)),
	createRoom: supervisor
		.input(
			z.object({
				homeId: z.uuid(),
				name: z.string().trim().min(1).max(100),
				capacity: z.number().int().min(1).max(20).default(1),
				status: z.enum(['available', 'reserved']).default('available')
			})
		)
		.mutation(({ ctx, input }) => intake.createRoom(ctx.db, ctx.user.agencyId, input)),
	updateRoom: supervisor
		.input(
			z.object({
				id: z.uuid(),
				name: z.string().trim().min(1).max(100).optional(),
				capacity: z.number().int().min(1).max(20).optional(),
				status: roomStatus.optional(),
				occupiedBy: z.uuid().nullable().optional()
			})
		)
		.mutation(({ ctx, input }) => intake.updateRoom(ctx.db, ctx.user.agencyId, input))
});
