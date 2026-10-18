// GET/POST /api/v1/webhooks (openapi.yaml listWebhooks, createWebhook)
import type { RequestHandler } from './$types';
import { intParam } from '#lib/domain/index.ts';
import { handleApi, readJson } from '#lib/server/external-api.ts';
import { createWebhook, listWebhooks } from '#lib/server/services/integration/index.ts';

export const GET: RequestHandler = (event) =>
	handleApi(event, { operation: 'listWebhooks' }, async (caller) => {
		const q = event.url.searchParams;
		const body = await listWebhooks(
			caller,
			intParam(q.get('limit'), 'limit', { min: 1, max: 100, fallback: 100 }),
			intParam(q.get('offset'), 'offset', { min: 0, max: 1_000_000, fallback: 0 })
		);
		return { body, records: body.data.length };
	});

export const POST: RequestHandler = (event) =>
	handleApi(event, { operation: 'createWebhook', scope: 'write' }, async (caller) => ({
		body: await createWebhook(caller, await readJson(event)),
		status: 201
	}));
