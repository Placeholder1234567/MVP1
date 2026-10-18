import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { localTime, TEMPLATE_NAME_MAX, weekStart } from '../../../domain/index.ts';
import {
	getSchedule,
	myShifts,
	setScheduleSlot,
	copyScheduleWeek,
	listScheduleTemplates,
	saveScheduleTemplate,
	applyScheduleTemplate,
	deleteScheduleTemplate,
	suggestScheduleWeek,
	applyScheduleSuggestions,
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
import { featureProcedure, featureRoleProcedure, router } from '../middleware.ts';
const slot = z.object({ homeId: z.uuid(), day: z.iso.date(), shift: z.enum(['am', 'pm', 'on']) });
const range = z
	.object({ from: z.coerce.date(), to: z.coerce.date() })
	.refine((r) => r.from <= r.to, 'Invalid time range');
export const scheduleRouter = router({
	postOpen: featureRoleProcedure('scheduling', 'supervisor')
		.input(slot)
		.mutation(({ ctx, input }) => startCoverage(ctx.db, ctx.user, input, true)),
	get: featureProcedure('scheduling')
		.input(z.object({ homeId: z.uuid(), weekStart: z.iso.date() }))
		.query(({ ctx, input }) =>
			getSchedule(ctx.db, ctx.user.agencyId, input.homeId, input.weekStart)
		),
	myShifts: featureProcedure('scheduling')
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
	setSlot: featureRoleProcedure('scheduling', 'supervisor')
		.input(slot.extend({ profileId: z.uuid() }))
		.mutation(({ ctx, input }) => setScheduleSlot(ctx.db, ctx.user, input)),
	clearSlot: featureRoleProcedure('scheduling', 'supervisor')
		.input(slot)
		.mutation(({ ctx, input }) => setScheduleSlot(ctx.db, ctx.user, { ...input, profileId: null })),
	copyWeek: featureRoleProcedure('scheduling', 'supervisor')
		.input(z.object({ homeId: z.uuid(), fromWeek: z.iso.date(), toWeek: z.iso.date() }))
		.mutation(({ ctx, input }) => copyScheduleWeek(ctx.db, ctx.user, input)),
	suggest: featureRoleProcedure('scheduling', 'supervisor')
		.input(z.object({ homeId: z.uuid(), weekStart: z.iso.date() }))
		.query(({ ctx, input }) => suggestScheduleWeek(ctx.db, ctx.user, input)),
	applySuggestions: featureRoleProcedure('scheduling', 'supervisor')
		.input(
			z.object({
				homeId: z.uuid(),
				weekStart: z.iso.date(),
				picks: z
					.array(
						z.object({
							day: z.iso.date(),
							shift: z.enum(['am', 'pm', 'on']),
							profileId: z.uuid()
						})
					)
					.min(1)
					.max(21)
			})
		)
		.mutation(({ ctx, input }) => applyScheduleSuggestions(ctx.db, ctx.user, input)),
	templates: featureRoleProcedure('scheduling', 'supervisor')
		.input(z.object({ homeId: z.uuid() }))
		.query(({ ctx, input }) => listScheduleTemplates(ctx.db, ctx.user, input.homeId)),
	saveTemplate: featureRoleProcedure('scheduling', 'supervisor')
		.input(
			z.object({
				homeId: z.uuid(),
				name: z.string().trim().min(1).max(TEMPLATE_NAME_MAX),
				fromWeek: z.iso.date()
			})
		)
		.mutation(({ ctx, input }) => saveScheduleTemplate(ctx.db, ctx.user, input)),
	applyTemplate: featureRoleProcedure('scheduling', 'supervisor')
		.input(z.object({ id: z.uuid(), toWeek: z.iso.date() }))
		.mutation(({ ctx, input }) => applyScheduleTemplate(ctx.db, ctx.user, input)),
	deleteTemplate: featureRoleProcedure('scheduling', 'supervisor')
		.input(z.object({ id: z.uuid() }))
		.mutation(({ ctx, input }) => deleteScheduleTemplate(ctx.db, ctx.user, input.id))
});
export const coverageRouter = router({
	callout: featureProcedure('coverage')
		.input(slot.extend({ reason: z.string().trim().max(1000).optional() }))
		.mutation(({ ctx, input }) => startCoverage(ctx.db, ctx.user, input)),
	offers: featureProcedure('coverage').query(({ ctx }) => coverageOffers(ctx.db, ctx.user)),
	accept: featureProcedure('coverage')
		.input(z.object({ id: z.uuid() }))
		.mutation(({ ctx, input }) => respondCoverage(ctx.db, ctx.user, input.id, 'accepted')),
	decline: featureProcedure('coverage')
		.input(z.object({ id: z.uuid() }))
		.mutation(({ ctx, input }) => respondCoverage(ctx.db, ctx.user, input.id, 'declined'))
});
export const clockRouter = router({
	clockIn: featureProcedure('timekeeping')
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
	clockOut: featureProcedure('timekeeping')
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
	list: featureProcedure('timekeeping')
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
	acknowledge: featureRoleProcedure('timekeeping', 'supervisor')
		.input(z.object({ id: z.uuid() }))
		.mutation(({ ctx, input }) => acknowledgeClock(ctx.db, ctx.user, input.id)),
	manualEntry: featureRoleProcedure('timekeeping', 'supervisor')
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
	timesheet: featureRoleProcedure('timekeeping', 'supervisor')
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
