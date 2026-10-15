import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
	draftNote,
	lomiCapabilities,
	LomiRateLimitError,
	transcribeAudio
} from '../../services/lomi/index.ts';
import { featureProcedure, router, userProcedure } from '../middleware.ts';

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
		.mutation(({ ctx, input }) => limited(() => transcribeAudio(ctx.user, input)))
});
