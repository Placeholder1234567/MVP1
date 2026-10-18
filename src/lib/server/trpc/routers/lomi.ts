import { SHIFT_SECTIONS, BEHAVIOR_SECTIONS } from '#lib/domain/lomi-edit.ts';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
	draftNote,
	editSection,
	routeObservations,
	lomiCapabilities,
	LomiRateLimitError,
	SummarizeInput,
	summarizeDay,
	transcribeAudio
} from '../../services/lomi/index.ts';
import { featureProcedure, featureRoleProcedure, router, userProcedure } from '../middleware.ts';

async function limited<T>(fn: () => Promise<T>) {
	try {
		return await fn();
	} catch (e) {
		if (e instanceof LomiRateLimitError)
			throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: e.message });
		throw e;
	}
}
export const lomiRouter = router({
	capabilities: userProcedure.query(() => lomiCapabilities()),
	draft: featureProcedure('lomi_drafting')
		.input(
			z.object({
				clientId: z.uuid(),
				type: z.enum(['shift', 'behavior']),
				prompt: z.string().trim().min(1).max(8000)
			})
		)
		.mutation(({ ctx, input }) => limited(() => draftNote(ctx.db, ctx.user, input))),
	edit: featureProcedure('lomi_drafting')
		.input(
			z.object({
				clientId: z.uuid(),
				section: z.enum([...SHIFT_SECTIONS, ...BEHAVIOR_SECTIONS]),
				current: z.string().max(6000),
				input: z.string().trim().min(1).max(2000)
			})
		)
		.mutation(({ ctx, input }) => limited(() => editSection(ctx.db, ctx.user, input))),
	route: featureProcedure('lomi_drafting')
		.input(
			z
				.object({
					clientId: z.uuid(),
					message: z.string().trim().min(1).max(2000),
					current: z.object({
						activities: z.string().max(6000),
						meals: z.string().max(6000),
						mood: z.string().max(6000),
						health: z.string().max(6000)
					})
				})
				.refine(
					(value) =>
						Object.values(value.current).reduce((n, text) => n + text.length, 0) +
							value.message.length <=
						8000,
					'Keep the combined draft and observations under 8000 characters; direct editing remains available.'
				)
		)
		.mutation(({ ctx, input }) => limited(() => routeObservations(ctx.db, ctx.user, input))),
	transcribe: featureProcedure('lomi_drafting')
		.input(
			z.object({
				audio: z
					.string()
					.min(4)
					.max(3500000)
					.regex(/^[A-Za-z0-9+/]+={0,2}$/),
				mimeType: z.enum(['audio/webm', 'audio/mp4', 'audio/wav', 'audio/ogg'])
			})
		)
		.mutation(({ ctx, input }) => limited(() => transcribeAudio(ctx.user, input))),
	// lomi_summary gates access; analytics_advanced adds highlights and recommendations.
	summarize: featureRoleProcedure('lomi_summary', 'supervisor')
		.input(SummarizeInput)
		.mutation(({ ctx, input }) => limited(() => summarizeDay(ctx.db, ctx.user, input)))
});
