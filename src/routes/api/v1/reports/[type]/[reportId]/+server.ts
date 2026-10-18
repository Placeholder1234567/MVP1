// GET /api/v1/reports/{type}/{reportId} (openapi.yaml getReportStatus)
import type { RequestHandler } from './$types';
import { isReportType, isUuid } from '#lib/domain/index.ts';
import { handleApi, notFound } from '#lib/server/external-api.ts';
import { reportStatus } from '#lib/server/services/integration/index.ts';

export const GET: RequestHandler = (event) =>
	handleApi(event, { operation: 'getReportStatus' }, async (caller) => {
		const { type, reportId } = event.params;
		if (!isReportType(type) || !isUuid(reportId)) throw notFound();
		const status = await reportStatus(caller, type, reportId.toLowerCase());
		if (!status) throw notFound();
		return { body: status };
	});
