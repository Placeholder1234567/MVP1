// POST /api/v1/webhooks/{webhookId}/test (openapi.yaml testWebhook)
import type { RequestHandler } from './$types';
import { isUuid } from '#lib/domain/index.ts';
import { handleApi, notFound } from '#lib/server/external-api.ts';
import { testWebhook } from '#lib/server/services/integration/index.ts';

export const POST: RequestHandler = (event) =>
	handleApi(event, { operation: 'testWebhook', scope: 'write' }, async (caller) => {
		if (!isUuid(event.params.webhookId)) throw notFound();
		const result = await testWebhook(caller, event.params.webhookId.toLowerCase());
		if (!result) throw notFound();
		return { body: result };
	});
