import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { localTime, weekStart } from '../../../domain/index.ts';
import {
	getSchedule,
	myShifts,
	setScheduleSlot,
	startCoverage,
	respondCoverage,
	coverageOffers
} from '../../services/schedule/index.ts';
import {
	acknowledgeClock,
	clockIn,
	clockOut,
	listClocks,
	manualClock,
	Position,
	timesheet
} from '../../services/clock/index.ts';
import { roleProcedure, router, userProcedure } from '../middleware.ts';
const slot = z.object({ homeId: z.uuid(), day: z.iso.date(), shift: z.enum(['am', 'pm', 'on']) });
const range = z
	.object({ from: z.coerce.date(), to: z.coerce.date() })
	.refine((r) => r.from <= r.to, 'Invalid time range');
export const scheduleRouter = router({
	postOpen: roleProcedure('supervisor')
		.input(slot)
		.mutation(({ ctx, input }) => startCoverage(ctx.db, ctx.user, input, true)),
	get: userProcedure
		.input(z.object({ homeId: z.uuid(), weekStart: z.iso.date() }))
		.query(({ ctx, input }) =>
			getSchedule(ctx.db, ctx.user.agencyId, input.homeId, input.weekStart)
		),
	myShifts: userProcedure
		.input(
			z
				.object({
					weekStart: z.iso.date().optional(),
					weeks: z.number().int().min(1).max(4).default(1)
				})
				.default({ weeks: 1 })
		)
		.query(({ ctx, input }) =>
			myShifts(
				ctx.db,
				ctx.user.agencyId,
				ctx.user.profileId,
				input.weekStart ?? weekStart(localTime(new Date(), ctx.user.timeZone).day),
				input.weeks
			)
		),
	setSlot: roleProcedure('supervisor')
		.input(slot.extend({ profileId: z.uuid() }))
		.mutation(({ ctx, input }) => setScheduleSlot(ctx.db, ctx.user, input)),
	clearSlot: roleProcedure('supervisor')
		.input(slot)
		.mutation(({ ctx, input }) => setScheduleSlot(ctx.db, ctx.user, { ...input, profileId: null }))
});
export const coverageRouter = router({
	callout: userProcedure
		.input(slot.extend({ reason: z.string().trim().max(1000).optional() }))
		.mutation(({ ctx, input }) => startCoverage(ctx.db, ctx.user, input)),
	offers: userProcedure.query(({ ctx }) => coverageOffers(ctx.db, ctx.user)),
	accept: userProcedure
		.input(z.object({ id: z.uuid() }))
		.mutation(({ ctx, input }) => respondCoverage(ctx.db, ctx.user, input.id, 'accepted')),
	decline: userProcedure
		.input(z.object({ id: z.uuid() }))
		.mutation(({ ctx, input }) => respondCoverage(ctx.db, ctx.user, input.id, 'declined'))
});
export const clockRouter = router({
	clockIn: userProcedure
		.input(
			z
				.object({
					homeId: z.uuid(),
					...Position,
					accuracy: z.number().min(0).max(100000).optional()
				})
				.refine(
					(p) => (p.lat === undefined) === (p.lng === undefined),
					'Both coordinates are required'
				)
		)
		.mutation(({ ctx, input }) => clockIn(ctx.db, ctx.user, { ...input, id: randomUUID() })),
	clockOut: userProcedure
		.input(
			z
				.object(Position)
				.refine(
					(p) => (p.lat === undefined) === (p.lng === undefined),
					'Both coordinates are required'
				)
				.default({})
		)
		.mutation(({ ctx, input }) => clockOut(ctx.db, ctx.user, input)),
	list: userProcedure
		.input(
			z
				.object({
					homeId: z.uuid().optional(),
					profileId: z.uuid().optional(),
					dateRange: range.optional()
				})
				.default({})
		)
		.query(({ ctx, input }) =>
			listClocks(ctx.db, ctx.user, {
				homeId: input.homeId,
				profileId: input.profileId,
				...input.dateRange
			})
		),
	acknowledge: roleProcedure('supervisor')
		.input(z.object({ id: z.uuid() }))
		.mutation(({ ctx, input }) => acknowledgeClock(ctx.db, ctx.user, input.id)),
	manualEntry: roleProcedure('supervisor')
		.input(
			z.object({
				profileId: z.uuid(),
				homeId: z.uuid(),
				clockInAt: z.coerce.date(),
				clockOutAt: z.coerce.date(),
				reason: z.string().trim().min(1).max(1000)
			})
		)
		.mutation(({ ctx, input }) => manualClock(ctx.db, ctx.user, input)),
	timesheet: roleProcedure('supervisor')
		.input(
			z.object({ profileId: z.uuid().optional(), homeId: z.uuid().optional(), dateRange: range })
		)
		.query(({ ctx, input }) =>
			timesheet(ctx.db, ctx.user, {
				profileId: input.profileId,
				homeId: input.homeId,
				...input.dateRange
			})
		)
});
