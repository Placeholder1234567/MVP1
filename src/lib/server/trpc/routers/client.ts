import { z } from 'zod';
import {
	archiveClient,
	ClientChanges,
	ClientFilter,
	createClient,
	DisclosureFilter,
	disclosureAccounting,
	getClient,
	HealthChanges,
	listClients,
	listDisclosures,
	NewClient,
	NewDisclosure,
	recordDisclosure,
	updateClient,
	updateHealth
} from '../../services/client/index.ts';
import { featureRoleProcedure, roleProcedure, router, userProcedure } from '../middleware.ts';

// trpc-router.md `client.*`. Caregivers read their homes' clients (RLS);
// supervisors create and edit; only admins archive.
export const clientRouter = router({
	list: userProcedure
		.input(ClientFilter.optional())
		.query(({ ctx, input }) => listClients(ctx.db, ctx.user.agencyId, input ?? {})),

	get: userProcedure
		.input(z.object({ id: z.uuid() }))
		.query(({ ctx, input }) => getClient(ctx.db, ctx.user.agencyId, ctx.user.features, input.id)),

	// Health details are charting data: without it on the plan they're not saved.
	create: roleProcedure('supervisor')
		.input(NewClient)
		.mutation(({ ctx, input }) =>
			createClient(
				ctx.db,
				ctx.user.agencyId,
				ctx.user.features.includes('charting') ? input : { ...input, healthInfo: undefined }
			)
		),

	update: roleProcedure('supervisor')
		.input(ClientChanges)
		.mutation(({ ctx, input }) => updateClient(ctx.db, ctx.user.agencyId, input)),

	updateHealth: featureRoleProcedure('charting', 'supervisor')
		.input(HealthChanges)
		.mutation(({ ctx, input }) => updateHealth(ctx.db, ctx.user.agencyId, input)),

	archive: roleProcedure('admin')
		.input(z.object({ id: z.uuid() }))
		.mutation(({ ctx, input }) => archiveClient(ctx.db, ctx.user.agencyId, input.id)),

	// Accounting of disclosures (HIPAA 164.528): supervisors, on every plan.
	disclosures: roleProcedure('supervisor')
		.input(DisclosureFilter)
		.query(({ ctx, input }) => listDisclosures(ctx.db, ctx.user, input)),

	recordDisclosure: roleProcedure('supervisor')
		.input(NewDisclosure)
		.mutation(({ ctx, input }) =>
			recordDisclosure(
				ctx.db,
				ctx.user.agencyId,
				{ profileId: ctx.user.profileId, name: ctx.user.name, timeZone: ctx.user.timeZone },
				input
			)
		),

	// A mutation, so the download is audited and nothing lands in a URL.
	disclosureAccounting: roleProcedure('supervisor')
		.input(DisclosureFilter)
		.mutation(({ ctx, input }) => disclosureAccounting(ctx.db, ctx.user, input, ctx.request))
});
