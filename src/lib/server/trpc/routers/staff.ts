import { z } from 'zod';
import {
	CredentialFilter,
	CredentialInput,
	listCredentials,
	removeCredential,
	saveCredential,
	getStaff,
	InviteInput,
	inviteStaff,
	listStaff,
	resetStaffMfa,
	StaffFilter,
	StaffUpdateInput,
	updateStaff
} from '../../services/auth/index.ts';
import { roleProcedure, router, userProcedure } from '../middleware.ts';

// trpc-router.md `staff.*`: supervisors see staff; only admins change them.
export const staffRouter = router({
	list: roleProcedure('supervisor')
		.input(StaffFilter.optional())
		.query(({ ctx, input }) => listStaff(ctx.db, ctx.user.agencyId, input ?? {})),

	get: roleProcedure('supervisor')
		.input(z.object({ id: z.uuid() }))
		.query(({ ctx, input }) => getStaff(ctx.db, ctx.user.agencyId, input.id)),

	/** Creates the sign-in and profile, then emails a password-setup link. */
	invite: roleProcedure('admin')
		.input(InviteInput)
		.mutation(({ ctx, input }) => inviteStaff(ctx.db, ctx.user, input)),

	/** Role, homes, med certification, active. Deactivating ends their sessions. */
	update: roleProcedure('admin')
		.input(StaffUpdateInput)
		.mutation(({ ctx, input }) => updateStaff(ctx.db, ctx.user, input)),

	/**
	 * Training and certifications with their status today: a caregiver gets
	 * their own, supervisors and admins one person's or everyone's.
	 */
	credentials: userProcedure
		.input(CredentialFilter.optional())
		.query(({ ctx, input }) => listCredentials(ctx.db, ctx.user, input ?? {})),

	/** Records a credential, or renews or corrects one (with its id). */
	saveCredential: roleProcedure('admin')
		.input(CredentialInput)
		.mutation(({ ctx, input }) => saveCredential(ctx.db, ctx.user, input)),

	removeCredential: roleProcedure('admin')
		.input(z.object({ id: z.uuid() }))
		.mutation(({ ctx, input }) => removeCredential(ctx.db, ctx.user, input.id)),

	/** Lost authenticator: remove their second factors so they can enroll again. */
	resetMfa: roleProcedure('admin')
		.input(z.object({ id: z.uuid() }))
		.mutation(({ ctx, input }) => resetStaffMfa(ctx.db, ctx.user, input.id, ctx.request))
});
