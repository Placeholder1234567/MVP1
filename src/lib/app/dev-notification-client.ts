import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import type { DevNotificationRouter } from '#lib/server/trpc/routers/dev-notification.ts';

export const devNotifications = createTRPCClient<DevNotificationRouter>({
	links: [httpBatchLink({ url: '/dev/notifications/api', transformer: superjson })]
});
