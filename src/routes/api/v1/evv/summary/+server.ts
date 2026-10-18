// GET /api/v1/evv/summary (openapi.yaml getEvvSummary)
import type { RequestHandler } from './$types';
import { dateRange, EVV_FEATURE, uuidParam } from '#lib/domain/index.ts';
import { handleApi } from '#lib/server/external-api.ts';
import { evvSummary } from '#lib/server/services/integration/index.ts';

export const GET: RequestHandler = (event) =>
	handleApi(event, { operation: 'getEvvSummary', feature: EVV_FEATURE }, async (caller) => {
		const q = event.url.searchParams;
		const { from, to } = dateRange(q.get('from'), q.get('to'), true);
		const body = await evvSummary(caller, {
			from: from!,
			to: to!,
			homeId: uuidParam(q.get('home_id'), 'home_id')
		});
		return { body };
	});
