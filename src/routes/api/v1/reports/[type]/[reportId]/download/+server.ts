// GET /api/v1/reports/{type}/{reportId}/download (openapi.yaml downloadReport):
// the CSV while it's ready, 409 before then or after it expires.
import type { RequestHandler } from './$types';
import { isReportType, isUuid } from '#lib/domain/index.ts';
import { ApiError, handleApi, notFound } from '#lib/server/external-api.ts';
import { downloadReport } from '#lib/server/services/integration/index.ts';

export const GET: RequestHandler = (event) =>
	handleApi(event, { operation: 'downloadReport' }, async (caller) => {
		const { type, reportId } = event.params;
		if (!isReportType(type) || !isUuid(reportId)) throw notFound();
		const result = await downloadReport(caller, type, reportId.toLowerCase());
		if (result.kind === 'missing') throw notFound();
		if (result.kind === 'not-ready')
			throw new ApiError(409, 'CONFLICT', 'Report is not ready for download or has expired');
		return {
			body: result.body,
			contentType: 'text/csv; charset=utf-8',
			filename: result.filename,
			records: result.rows
		};
	});
