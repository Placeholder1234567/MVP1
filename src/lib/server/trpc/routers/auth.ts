import { TRPCError } from '@trpc/server';
import {
	getProfile,
	OwnProfileInput,
	saveTheme,
	ThemeInput,
	updateOwnProfile
} from '../../services/auth/index.ts';
import { router, userProcedure } from '../middleware.ts';

export const authRouter = router({
	/** The caller's profile, used on app start (trpc-router.md: auth.me). */
	me: userProcedure.query(async ({ ctx }) => {
		const me = await getProfile(ctx.db, ctx.user.agencyId, ctx.user.profileId);
		if (!me) throw new TRPCError({ code: 'NOT_FOUND', message: 'Profile not found' });
		return { ...me, homeIds: me.homeIds ?? [] };
	}),

	/** Name, phone and avatar only; role, homes and status are admin-only (staff.update). */
	updateProfile: userProcedure
		.input(OwnProfileInput)
		.mutation(({ ctx, input }) => updateOwnProfile(ctx.db, ctx.user, input)),

	/** Light, dark or auto (frontend-spec-1.md §10.1); read back from the synced user_settings row. */
	setTheme: userProcedure
		.input(ThemeInput)
		.mutation(({ ctx, input }) => saveTheme(ctx.db, ctx.user, input))
});
