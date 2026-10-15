// health.*, incident.* and attendance.* (trpc-router.md).
import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { ATTENDANCE_SERVICES, INCIDENT_TYPES } from '../../../domain/index.ts';
import { listAttendance, saveAttendance } from '../../services/attendance/index.ts';
import {
	acknowledgeHealth,
	createHealthEntry,
	listHealthEntries
} from '../../services/health/index.ts';
import {
	createIncident,
	getIncident,
	listIncidents,
	markNotified,
	reviewIncident
} from '../../services/incident/index.ts';
import { roleProcedure, router, userProcedure } from '../middleware.ts';

const kind = z.enum(['vitals', 'seizure', 'illness', 'appointment']);
const page = {
	limit: z.number().int().min(1).max(100).default(50),
	offset: z.number().int().min(0).default(0)
};

export const healthRouter = router({
	create: userProcedure
		.input(
			z.object({
				id: z.uuid().optional(),
				clientId: z.uuid(),
				kind,
				data: z.record(z.string(), z.unknown()),
				recordedAt: z.coerce.date().optional()
			})
		)
		.mutation(async ({ ctx, input }) => {
			const r = await createHealthEntry(ctx.db, ctx.user.agencyId, ctx.user, {
				...input,
				id: input.id ?? randomUUID()
			});
			return {
				id: r.id,
				clientId: input.clientId,
				kind: r.kind,
				data: r.data,
				flags: r.flags,
				recordedAt: r.recordedAt
			};
		}),

	list: userProcedure
		.input(
			z.object({
				clientId: z.uuid().optional(),
				homeId: z.uuid().optional(),
				kind: kind.optional(),
				dateRange: z.object({ from: z.coerce.date(), to: z.coerce.date() }).optional(),
				...page
			})
		)
		.query(({ ctx, input }) =>
			listHealthEntries(ctx.db, ctx.user.agencyId, {
				...input,
				from: input.dateRange?.from,
				to: input.dateRange?.to
			})
		),

	acknowledge: roleProcedure('supervisor')
		.input(z.object({ id: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			const { updatedAt } = await acknowledgeHealth(ctx.db, ctx.user.agencyId, ctx.user, input.id);
			return { id: input.id, acknowledged: true as const, updatedAt };
		})
});

export const incidentRouter = router({
	create: userProcedure
		.input(
			z.object({
				id: z.uuid().optional(),
				clientId: z.uuid(),
				type: z.enum(INCIDENT_TYPES),
				severity: z.enum(['Low', 'Medium', 'High']),
				occurredAt: z.coerce.date(),
				location: z.string().optional(),
				description: z.string(),
				antecedent: z.string().optional(),
				injured: z.string().optional(),
				injuryDetail: z.string().optional(),
				staffAction: z.string().optional(),
				medicalFollowup: z.string().optional(),
				witnesses: z.string().optional(),
				notifiedParties: z.array(z.string()).optional()
			})
		)
		.mutation(({ ctx, input }) =>
			createIncident(ctx.db, ctx.user.agencyId, ctx.user, {
				...input,
				id: input.id ?? randomUUID()
			})
		),

	get: userProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
		const incident = await getIncident(ctx.db, ctx.user.agencyId, input.id);
		if (!incident) throw new TRPCError({ code: 'NOT_FOUND', message: 'Incident not found' });
		return incident;
	}),

	list: userProcedure
		.input(
			z.object({
				homeId: z.uuid().optional(),
				clientId: z.uuid().optional(),
				status: z.enum(['open', 'reviewed', 'closed']).optional(),
				severity: z.enum(['Low', 'Medium', 'High']).optional(),
				...page
			})
		)
		.query(({ ctx, input }) => listIncidents(ctx.db, ctx.user.agencyId, input)),

	review: roleProcedure('supervisor')
		.input(z.object({ id: z.uuid(), followupNotes: z.string() }))
		.mutation(async ({ ctx, input }) => ({
			id: input.id,
			...(await reviewIncident(ctx.db, ctx.user.agencyId, ctx.user, input.id, input.followupNotes))
		})),

	markNotified: roleProcedure('supervisor')
		.input(z.object({ id: z.uuid(), party: z.string() }))
		.mutation(async ({ ctx, input }) => ({
			id: input.id,
			...(await markNotified(ctx.db, ctx.user.agencyId, ctx.user, input.id, input.party))
		}))
});

export const attendanceRouter = router({
	save: userProcedure
		.input(
			z.object({
				clientId: z.uuid(),
				day: z.iso.date(),
				services: z.array(z.enum(ATTENDANCE_SERVICES))
			})
		)
		.mutation(({ ctx, input }) => saveAttendance(ctx.db, ctx.user.agencyId, ctx.user, input)),

	list: userProcedure
		.input(
			z.object({
				clientId: z.uuid().optional(),
				homeId: z.uuid().optional(),
				dateRange: z.object({ from: z.iso.date(), to: z.iso.date() }).optional()
			})
		)
		.query(({ ctx, input }) =>
			listAttendance(ctx.db, ctx.user.agencyId, {
				clientId: input.clientId,
				homeId: input.homeId,
				from: input.dateRange?.from,
				to: input.dateRange?.to
			})
		)
});
