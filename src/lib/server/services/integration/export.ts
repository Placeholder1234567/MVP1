// Bulk export (openapi.yaml /export/{type}) for warehouses, backups and
// migration: pages of up to 1,000 records, in JSON or CSV, ordered by last
// update so `since` delta syncs page cleanly.
import { addDays, csvRows, localInstant, type ExportType } from '../../../domain/index.ts';
import { withService } from '../../db';
import type { ApiCaller } from './keys';
import { exportRows } from './export.queries';

export interface ExportQuery {
	type: ExportType;
	from: string | null;
	to: string | null;
	since: Date | null;
	homeId: string | null;
	includeHealth: boolean;
	limit: number;
	offset: number;
}

const plain = (v: unknown) => (v instanceof Date ? v.toISOString() : v === undefined ? null : v);

export function exportData(caller: ApiCaller, q: ExportQuery) {
	return withService(async (tx) => {
		const { columns, rows, total } = await exportRows(
			tx,
			q.type,
			{
				agencyId: caller.agencyId,
				homeId: q.homeId,
				start: q.from ? localInstant(q.from, '00:00', caller.timeZone) : null,
				end: q.to ? localInstant(addDays(q.to, 1), '00:00', caller.timeZone) : null,
				since: q.since
			},
			q.includeHealth,
			q.limit,
			q.offset
		);
		const data = rows.map((r) => Object.fromEntries(columns.map((c) => [c, plain(r[c])])));
		return { columns, data, pagination: { limit: q.limit, offset: q.offset, total } };
	});
}

/** CSV with a header row; arrays and objects become JSON text in their cell. */
export function exportCsv(columns: string[], data: Record<string, unknown>[]): string {
	const cell = (v: unknown) =>
		v === null || v === undefined
			? null
			: typeof v === 'object'
				? JSON.stringify(v)
				: typeof v === 'number'
					? v
					: String(v);
	return csvRows([columns, ...data.map((r) => columns.map((c) => cell(r[c])))]);
}
