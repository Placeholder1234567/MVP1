import { z } from 'zod';
import {
	adminDeleteWebhook,
	adminWebhooks,
	createApiKey,
	CreateKeyInput,
	listApiKeys,
	revokeApiKey
} from '../../services/integration/index.ts';
import { roleProcedure, router } from '../middleware.ts';

// API keys for the external API (openapi.yaml): admins only (rls.sql api_keys).
// The plaintext key is returned once, by create.
const admin = roleProcedure('admin');

export const apiKeyRouter = router({
	list: admin.query(({ ctx }) => listApiKeys(ctx.db, ctx.user.agencyId)),
	create: admin
		.input(CreateKeyInput)
		.mutation(({ ctx, input }) =>
			createApiKey(ctx.db, ctx.user.agencyId, ctx.user.profileId, input)
		),
	revoke: admin
		.input(z.object({ id: z.uuid() }))
		.mutation(({ ctx, input }) => revokeApiKey(ctx.db, ctx.user.agencyId, input.id)),
	/** Webhooks registered through the API, so admins can see and remove them in the app. */
	webhooks: admin.query(({ ctx }) => adminWebhooks(ctx.db, ctx.user.agencyId)),
	deleteWebhook: admin
		.input(z.object({ id: z.uuid() }))
		.mutation(({ ctx, input }) => adminDeleteWebhook(ctx.db, ctx.user.agencyId, input.id))
});
