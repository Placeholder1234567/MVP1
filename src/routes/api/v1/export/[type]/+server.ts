// GET /api/v1/export/{type} (openapi.yaml exportData): pages of up to 1,000
// records as CSV (default) or JSON, 60 requests an hour per key.
import type { RequestHandler } from './$types';
import {
	ApiInputError,
	boolParam,
	dateRange,
	EXPORT_FEATURE,
	EXPORT_TYPES,
	instantParam,
	intParam,
	uuidParam,
	type ExportType
} from '#lib/domain/index.ts';
import { ApiError, handleApi } from '#lib/server/external-api.ts';
import { exportCsv, exportData } from '#lib/server/services/integration/index.ts';

const isType = (t: string): t is ExportType => (EXPORT_TYPES as readonly string[]).includes(t);

export const GET: RequestHandler = (event) => {
	const type = event.params.type;
	if (!isType(type))
		return handleApi(event, { operation: 'exportData' }, async () => {
			throw new ApiError(
				400,
				'BAD_REQUEST',
				`Unknown export type. Use one of: ${EXPORT_TYPES.join(', ')}`
			);
		});
	return handleApi(
		event,
		{ operation: 'exportData', feature: EXPORT_FEATURE[type], bulk: true },
		async (caller) => {
			const q = event.url.searchParams;
			const format = q.get('format') ?? 'csv';
			if (format !== 'csv' && format !== 'json')
				throw new ApiInputError("'format' must be csv or json");
			const { from, to } = dateRange(q.get('from'), q.get('to'), false);
			const includeHealth = boolParam(q.get('include_health'), 'include_health');
			if (includeHealth && type !== 'clients')
				throw new ApiInputError("'include_health' applies only to client exports");
			if (includeHealth && !caller.features.has('health'))
				throw new ApiError(403, 'FORBIDDEN', "Health details aren't included in the agency's plan");
			const out = await exportData(caller, {
				type,
				from,
				to,
				since: instantParam(q.get('since'), 'since'),
				homeId: uuidParam(q.get('home_id'), 'home_id'),
				includeHealth,
				limit: intParam(q.get('limit'), 'limit', { min: 1, max: 1000, fallback: 1000 }),
				offset: intParam(q.get('offset'), 'offset', { min: 0, max: 10_000_000, fallback: 0 })
			});
			if (format === 'json')
				return {
					body: {
						data: out.data,
						pagination: out.pagination,
						exported_at: new Date().toISOString()
					},
					records: out.data.length
				};
			return {
				body: exportCsv(out.columns, out.data),
				contentType: 'text/csv; charset=utf-8',
				filename: `export-${type}-${new Date().toISOString().slice(0, 10)}-${out.pagination.offset}.csv`,
				records: out.data.length
			};
		}
	);
};
