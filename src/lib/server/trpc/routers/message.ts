import { z } from 'zod';
import { getPhoto, PhotoUpload, uploadPhoto } from '../../services/message/index.ts';
import { featureProcedure, router } from '../middleware.ts';

// Board photos (trpc-router.md `message.*`; messages themselves are synced
// rows written through sync.upload). Online only.
const messaging = featureProcedure('messaging');

export const messageRouter = router({
	uploadPhoto: messaging
		.input(PhotoUpload)
		.mutation(({ ctx, input }) => uploadPhoto(ctx.db, ctx.user.agencyId, ctx.user, input)),

	photo: messaging
		.input(z.object({ id: z.uuid() }))
		.query(({ ctx, input }) => getPhoto(ctx.db, ctx.user.agencyId, ctx.user, input.id, ctx.request))
});
