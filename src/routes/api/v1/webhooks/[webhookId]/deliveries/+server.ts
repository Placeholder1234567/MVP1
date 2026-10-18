// GET /api/v1/webhooks/{webhookId}/deliveries (openapi.yaml listWebhookDeliveries):
// the last 100 attempts, newest first.
import type { RequestHandler } from './$types';
import { intParam, isUuid } from '#lib/domain/index.ts';
import { handleApi, notFound } from '#lib/server/external-api.ts';
import { listWebhookDeliveries } from '#lib/server/services/integration/index.ts';

export const GET: RequestHandler = (event) =>
	handleApi(event, { operation: 'listWebhookDeliveries' }, async (caller) => {
		if (!isUuid(event.params.webhookId)) throw notFound();
		const q = event.url.searchParams;
		const limit = intParam(q.get('limit'), 'limit', { min: 1, max: 100, fallback: 100 });
		const offset = intParam(q.get('offset'), 'offset', { min: 0, max: 99, fallback: 0 });
		const body = await listWebhookDeliveries(
			caller,
			event.params.webhookId.toLowerCase(),
			Math.min(limit, 100 - offset),
			offset
		);
		if (!body) throw notFound();
		return { body, records: body.data.length };
	});
