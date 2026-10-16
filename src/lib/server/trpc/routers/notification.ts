import { z } from 'zod';
import {
	getNotification,
	listNotifications,
	markNotificationsRead,
	updatePreferences,
	PreferencesInput
} from '../../services/notification/index.ts';
import { featureProcedure, router } from '../middleware.ts';
import {
	quietHours,
	saveQuietHours,
	QuietHoursInput,
	listPushDevices,
	registerPushDevice,
	removePushDevice,
	PushDeviceInput
} from '../../services/notification/index.ts';
export const notificationRouter = router({
	pushConfiguration: featureProcedure('notifications').query(() => ({
		enabled: process.env.PUSH_DRIVER === 'fcm'
	})),
	quietHours: featureProcedure('notifications').query(({ ctx }) => quietHours(ctx.db, ctx.user)),
	setQuietHours: featureProcedure('notifications')
		.input(QuietHoursInput)
		.mutation(({ ctx, input }) => saveQuietHours(ctx.db, ctx.user, input)),
	pushDevices: featureProcedure('notifications').query(({ ctx }) =>
		listPushDevices(ctx.db, ctx.user)
	),
	registerPushDevice: featureProcedure('notifications')
		.input(PushDeviceInput)
		.mutation(({ ctx, input }) => registerPushDevice(ctx.db, ctx.user, input)),
	removePushDevice: featureProcedure('notifications')
		.input(z.object({ id: z.uuid() }))
		.mutation(({ ctx, input }) => removePushDevice(ctx.db, ctx.user, input.id)),
	get: featureProcedure('notifications')
		.input(z.object({ id: z.uuid() }))
		.query(({ ctx, input }) =>
			getNotification(ctx.db, ctx.user.agencyId, ctx.user.profileId, input.id)
		),
	list: featureProcedure('notifications')
		.input(
			z
				.object({
					unreadOnly: z.boolean().optional(),
					channel: z.enum(['in_app', 'push', 'sms', 'email']).optional(),
					limit: z.number().int().min(1).max(100).default(50),
					offset: z.number().int().min(0).max(100000).default(0)
				})
				.default({ limit: 50, offset: 0 })
		)
		.query(({ ctx, input }) =>
			listNotifications(ctx.db, ctx.user.agencyId, ctx.user.profileId, input)
		),
	markRead: featureProcedure('notifications')
		.input(z.object({ ids: z.array(z.uuid()).min(1).max(100) }))
		.mutation(({ ctx, input }) =>
			markNotificationsRead(ctx.db, ctx.user.agencyId, ctx.user.profileId, input.ids)
		),
	updatePreferences: featureProcedure('notifications')
		.input(z.object({ preferences: PreferencesInput }))
		.mutation(({ ctx, input }) =>
			updatePreferences(ctx.db, ctx.user.agencyId, ctx.user, input.preferences)
		)
});
