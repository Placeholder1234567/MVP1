import { randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
	approveNote,
	createNote,
	GoalEntry,
	getNote,
	listNotes,
	sendBackNote,
	signNote,
	updateNote
} from '../../services/charting/index.ts';
import { noteVersions } from '../../services/audit/index.ts';
import { featureProcedure, featureRoleProcedure, router } from '../middleware.ts';

const shift = z.enum(['am', 'pm', 'on']);
const Content = z.record(z.string(), z.unknown());

export const noteRouter = router({
	// A mutation: reading earlier versions is recorded in the audit trail.
	versions: featureRoleProcedure('note_review', 'supervisor')
		.input(z.object({ id: z.uuid() }))
		.mutation(({ ctx, input }) =>
			noteVersions(ctx.db, ctx.user.agencyId, ctx.user.profileId, input.id, ctx.request)
		),
	create: featureProcedure('charting')
		.input(
			z.object({
				id: z.uuid().optional(),
				clientId: z.uuid(),
				day: z.iso.date().optional(),
				shift: shift.optional(),
				type: z.enum(['shift', 'behavior']),
				content: Content.default({}),
				goals: z.array(GoalEntry).max(30).optional(),
				lomiDrafted: z.boolean().optional()
			})
		)
		.mutation(async ({ ctx, input }) => {
			const { id } = await createNote(ctx.db, ctx.user.agencyId, ctx.user, {
				...input,
				id: input.id ?? randomUUID()
			});
			const note = await getNote(ctx.db, ctx.user.agencyId, id);
			return { id, status: note!.status, createdAt: note!.createdAt };
		}),

	get: featureProcedure('charting')
		.input(z.object({ id: z.uuid() }))
		.query(async ({ ctx, input }) => {
			const note = await getNote(ctx.db, ctx.user.agencyId, input.id);
			if (!note) throw new TRPCError({ code: 'NOT_FOUND', message: 'Note not found' });
			return note;
		}),

	list: featureProcedure('charting')
		.input(
			z.object({
				homeId: z.uuid().optional(),
				clientId: z.uuid().optional(),
				day: z.iso.date().optional(),
				shift: shift.optional(),
				status: z.enum(['draft', 'submitted', 'approved', 'returned']).optional(),
				authorId: z.uuid().optional(),
				limit: z.number().int().min(1).max(100).default(50),
				offset: z.number().int().min(0).default(0)
			})
		)
		// Caregivers only ever see their own homes' notes: RLS (notes_select).
		.query(({ ctx, input }) => listNotes(ctx.db, ctx.user.agencyId, input)),

	update: featureProcedure('charting')
		.input(
			z.object({
				id: z.uuid(),
				lomiDrafted: z.literal(true).optional(),
				content: Content.optional(),
				goals: z.array(GoalEntry).max(30).optional()
			})
		)
		.mutation(async ({ ctx, input }) => {
			const { id, ...changes } = input;
			const { updatedAt } = await updateNote(ctx.db, ctx.user.agencyId, ctx.user, id, changes);
			const note = await getNote(ctx.db, ctx.user.agencyId, id);
			return { id, content: note!.content, updatedAt };
		}),

	/** The human-signature step; the client confirms intent before calling it. */
	sign: featureProcedure('charting')
		.input(z.object({ id: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			const { updatedAt } = await signNote(ctx.db, ctx.user.agencyId, ctx.user, input.id);
			return { id: input.id, status: 'submitted' as const, updatedAt };
		}),

	approve: featureRoleProcedure('note_review', 'supervisor')
		.input(z.object({ id: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			const { updatedAt } = await approveNote(ctx.db, ctx.user.agencyId, ctx.user, input.id);
			return { id: input.id, status: 'approved' as const, updatedAt };
		}),

	sendBack: featureRoleProcedure('note_review', 'supervisor')
		.input(z.object({ id: z.uuid(), comment: z.string().trim().min(1).max(2000) }))
		.mutation(async ({ ctx, input }) => {
			const { updatedAt } = await sendBackNote(
				ctx.db,
				ctx.user.agencyId,
				ctx.user,
				input.id,
				input.comment
			);
			return {
				id: input.id,
				status: 'returned' as const,
				supervisorComment: input.comment,
				updatedAt
			};
		})
});
