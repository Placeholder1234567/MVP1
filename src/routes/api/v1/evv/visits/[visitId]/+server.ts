// GET /api/v1/evv/visits/{visitId} (openapi.yaml getEvvVisit)
import type { RequestHandler } from './$types';
import { EVV_FEATURE, isUuid } from '#lib/domain/index.ts';
import { handleApi, notFound } from '#lib/server/external-api.ts';
import { getEvvVisit } from '#lib/server/services/integration/index.ts';

export const GET: RequestHandler = (event) =>
	handleApi(event, { operation: 'getEvvVisit', feature: EVV_FEATURE }, async (caller) => {
		if (!isUuid(event.params.visitId)) throw notFound();
		const visit = await getEvvVisit(caller, event.params.visitId.toLowerCase());
		if (!visit) throw notFound();
		return { body: visit, records: 1 };
	});
