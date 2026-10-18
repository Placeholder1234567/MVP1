// POST /api/v1/reports/{type} (openapi.yaml generateReport): queues a report.
import type { RequestHandler } from './$types';
import { isReportType, reportAllowed } from '#lib/domain/index.ts';
import { ApiError, handleApi, notFound, readJson } from '#lib/server/external-api.ts';
import { requestReport } from '#lib/server/services/integration/index.ts';

export const POST: RequestHandler = (event) =>
	handleApi(event, { operation: 'generateReport', scope: 'write' }, async (caller) => {
		const type = event.params.type;
		if (!isReportType(type)) throw notFound();
		if (!reportAllowed(type, caller.features))
			throw new ApiError(403, 'FORBIDDEN', "This report isn't included in the agency's plan");
		return { body: await requestReport(caller, type, await readJson(event)), status: 202 };
	});
