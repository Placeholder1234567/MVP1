// GET /api/v1/evv/visits (openapi.yaml listEvvVisits)
import type { RequestHandler } from './$types';
import { boolParam, dateRange, EVV_FEATURE, intParam, uuidParam } from '#lib/domain/index.ts';
import { handleApi } from '#lib/server/external-api.ts';
import { listEvvVisits } from '#lib/server/services/integration/index.ts';

export const GET: RequestHandler = (event) =>
	handleApi(event, { operation: 'listEvvVisits', feature: EVV_FEATURE }, async (caller) => {
		const q = event.url.searchParams;
		const { from, to } = dateRange(q.get('from'), q.get('to'), true);
		const body = await listEvvVisits(caller, {
			from: from!,
			to: to!,
			homeId: uuidParam(q.get('home_id'), 'home_id'),
			profileId: uuidParam(q.get('profile_id'), 'profile_id'),
			verifiedOnly: boolParam(q.get('verified_only'), 'verified_only'),
			limit: intParam(q.get('limit'), 'limit', { min: 1, max: 100, fallback: 100 }),
			offset: intParam(q.get('offset'), 'offset', { min: 0, max: 1_000_000, fallback: 0 })
		});
		return { body, records: body.data.length };
	});
