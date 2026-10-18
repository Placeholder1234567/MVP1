import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
	NewMedication,
	MedicationChanges,
	MedicationId,
	MedicationHistoryFilter,
	createMedication,
	updateMedication,
	stopMedication,
	medicationHistory,
	acknowledgeDose,
	listMar,
	listMedications,
	recordDose,
	NewCountEntry,
	Countersign,
	recordCountEntry,
	countersign,
	recordEffect
} from '../../services/medication/index.ts';
import { featureProcedure, featureRoleProcedure, router } from '../middleware.ts';

const range = z.object({ from: z.iso.date(), to: z.iso.date() });

export const marRouter = router({
	/**
	 * Records a dose. A duplicate scheduled slot is kept as a conflict record
	 * and supervisors are alerted, the same as for offline uploads.
	 */
	record: featureProcedure('mar')
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

	recordEffect: featureProcedure('mar')
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

	list: featureProcedure('mar')
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

	acknowledge: featureRoleProcedure('mar', 'supervisor')
		.input(z.object({ id: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			const { updatedAt } = await acknowledgeDose(ctx.db, ctx.user.agencyId, ctx.user, input.id);
			return { id: input.id, acknowledged: true as const, updatedAt };
		})
});

export const medicationRouter = router({
	create: featureRoleProcedure('mar', 'supervisor')
		.input(NewMedication)
		.mutation(({ ctx, input }) => createMedication(ctx.db, ctx.user.agencyId, ctx.user, input)),
	update: featureRoleProcedure('mar', 'supervisor')
		.input(MedicationChanges)
		.mutation(({ ctx, input }) => updateMedication(ctx.db, ctx.user.agencyId, ctx.user, input)),
	stop: featureRoleProcedure('mar', 'supervisor')
		.input(MedicationId)
		.mutation(({ ctx, input }) => stopMedication(ctx.db, ctx.user.agencyId, ctx.user, input)),
	history: featureRoleProcedure('mar', 'supervisor')
		.input(MedicationHistoryFilter)
		.query(({ ctx, input }) => medicationHistory(ctx.db, ctx.user.agencyId, ctx.user, input)),
	/** Count book entry for a controlled medication (domain/controlled.ts). */
	countEntry: featureProcedure('mar')
		.input(NewCountEntry)
		.mutation(({ ctx, input }) => recordCountEntry(ctx.db, ctx.user.agencyId, ctx.user, input)),
	/** The named witness countersigns from their own device. */
	countersign: featureProcedure('mar')
		.input(Countersign)
		.mutation(({ ctx, input }) => countersign(ctx.db, ctx.user.agencyId, ctx.user, input)),
	list: featureProcedure('mar')
		.input(z.object({ clientId: z.uuid(), includeStopped: z.boolean().default(false) }))
		.query(({ ctx, input }) =>
			listMedications(ctx.db, ctx.user.agencyId, input.clientId, input.includeStopped)
		)
});
