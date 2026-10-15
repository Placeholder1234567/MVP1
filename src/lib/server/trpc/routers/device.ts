import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { DeviceRevokedError, issueDeviceKey } from '../../services/device/index.ts';
import { router, userProcedure } from '../middleware.ts';

export const deviceRouter = router({
	/**
	 * The local database key for this device (online sign-in only). The device
	 * keeps it in memory and stores it on disk only wrapped with the user's PIN.
	 */
	key: userProcedure.input(z.object({ deviceId: z.uuid() })).mutation(async ({ ctx, input }) => {
		try {
			const key = await issueDeviceKey(ctx.user.agencyId, ctx.user.profileId, input.deviceId);
			return { key: key.toString('base64url') };
		} catch (e) {
			if (e instanceof DeviceRevokedError) {
				throw new TRPCError({ code: 'FORBIDDEN', message: e.message });
			}
			throw e;
		}
	})
});
