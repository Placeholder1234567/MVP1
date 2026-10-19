import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { photoUploads } from '../../rate-limit.ts';
import { getPhoto, PhotoUpload, uploadPhoto } from '../../services/message/index.ts';
import { featureProcedure, router } from '../middleware.ts';

// Board photos (trpc-router.md `message.*`; messages themselves are synced
// rows written through sync.upload). Online only.
const messaging = featureProcedure('messaging');

export const messageRouter = router({
	uploadPhoto: messaging.input(PhotoUpload).mutation(({ ctx, input }) => {
		const wait = photoUploads.take(ctx.user.profileId);
		if (wait)
			throw new TRPCError({
				code: 'TOO_MANY_REQUESTS',
				message: `Too many photos for now. Try again in ${Math.ceil(wait / 60)} minutes.`
			});
		return uploadPhoto(ctx.db, ctx.user.agencyId, ctx.user, input);
	}),

	photo: messaging
		.input(z.object({ id: z.uuid() }))
		.query(({ ctx, input }) => getPhoto(ctx.db, ctx.user.agencyId, ctx.user, input.id, ctx.request))
});
