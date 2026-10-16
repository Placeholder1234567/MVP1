import { z } from 'zod';
import {
	archiveClient,
	ClientChanges,
	ClientFilter,
	createClient,
	getClient,
	HealthChanges,
	listClients,
	NewClient,
	updateClient,
	updateHealth
} from '../../services/client/index.ts';
import { roleProcedure, router, userProcedure } from '../middleware.ts';

// trpc-router.md `client.*`. Caregivers read their homes' clients (RLS);
// supervisors create and edit; only admins archive.
export const clientRouter = router({
	list: userProcedure
		.input(ClientFilter.optional())
		.query(({ ctx, input }) => listClients(ctx.db, ctx.user.agencyId, input ?? {})),

	get: userProcedure
		.input(z.object({ id: z.uuid() }))
		.query(({ ctx, input }) => getClient(ctx.db, ctx.user.agencyId, ctx.user.features, input.id)),

	create: roleProcedure('supervisor')
		.input(NewClient)
		.mutation(({ ctx, input }) => createClient(ctx.db, ctx.user.agencyId, input)),

	update: roleProcedure('supervisor')
		.input(ClientChanges)
		.mutation(({ ctx, input }) => updateClient(ctx.db, ctx.user.agencyId, input)),

	updateHealth: roleProcedure('supervisor')
		.input(HealthChanges)
		.mutation(({ ctx, input }) => updateHealth(ctx.db, ctx.user.agencyId, input)),

	archive: roleProcedure('admin')
		.input(z.object({ id: z.uuid() }))
		.mutation(({ ctx, input }) => archiveClient(ctx.db, ctx.user.agencyId, input.id))
});
