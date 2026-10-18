// GET/PATCH/DELETE /api/v1/webhooks/{webhookId} (openapi.yaml getWebhook,
// updateWebhook, deleteWebhook)
import type { RequestHandler } from './$types';
import { isUuid } from '#lib/domain/index.ts';
import { handleApi, notFound, readJson } from '#lib/server/external-api.ts';
import {
	deleteWebhook,
	getWebhook,
	updateWebhook
} from '#lib/server/services/integration/index.ts';

const idOf = (raw: string) => {
	if (!isUuid(raw)) throw notFound();
	return raw.toLowerCase();
};

export const GET: RequestHandler = (event) =>
	handleApi(event, { operation: 'getWebhook' }, async (caller) => {
		const hook = await getWebhook(caller, idOf(event.params.webhookId));
		if (!hook) throw notFound();
		return { body: hook };
	});

export const PATCH: RequestHandler = (event) =>
	handleApi(event, { operation: 'updateWebhook', scope: 'write' }, async (caller) => {
		const id = idOf(event.params.webhookId);
		const hook = await updateWebhook(caller, id, await readJson(event));
		if (!hook) throw notFound();
		return { body: hook };
	});

export const DELETE: RequestHandler = (event) =>
	handleApi(event, { operation: 'deleteWebhook', scope: 'write' }, async (caller) => {
		if (!(await deleteWebhook(caller, idOf(event.params.webhookId)))) throw notFound();
		return { body: null, status: 204 };
	});
