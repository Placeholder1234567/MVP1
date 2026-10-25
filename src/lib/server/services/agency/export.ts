// Full agency data export (security.md "Agency data export"): a copy of every
// record the agency holds, for returning data when it leaves (HIPAA business
// associate terms, 45 CFR 164.504(e)(2)(ii)(J)) or on its request. Operator
// only: no tRPC or API exposure. All tables are read in one repeatable-read
// snapshot, so files agree with each other, and the export is recorded in the
// agency's audit log with the operator, row counts and file checksums.
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { csvRows } from '../../../domain/index.ts';
import { withService } from '../../db';
import { ServiceError } from '../../errors';
import { agencyBySlug, recordAgencyExport } from './agency.queries';
import { DROPPED_COLUMNS, EXPORT_TABLES, exportPage, type ExportTable } from './export.queries';

export const AgencyExportInput = z
	.object({
		slug: z.string().trim().min(1).max(100),
		operator: z.string().trim().min(3).max(254)
	})
	.strict();

export interface TableManifest {
	file: string;
	rows: number;
	sha256: string;
}
export interface AgencyExportManifest {
	operationId: string;
	agencyId: string;
	exportedAt: string;
	format: 'csv';
	tables: Record<ExportTable, TableManifest>;
}

const PAGE = 1000;

/** Drops secrets nested in audit_log before/after values (e.g. a profile's auth_uid). */
function redact(value: unknown): unknown {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
	return Object.fromEntries(Object.entries(value).filter(([k]) => !DROPPED_COLUMNS.has(k)));
}

function cell(value: unknown): string | number | null {
	if (value === null || value === undefined) return null;
	if (value instanceof Date) return value.toISOString();
	if (typeof value === 'number') return value;
	if (typeof value === 'object') return JSON.stringify(value);
	return String(value);
}

/**
 * Streams each table as CSV text to `write` (header first, then pages), in
 * EXPORT_TABLES order. `write` must not throw for a partial table: on any
 * error nothing is recorded and the caller should discard what it wrote.
 */
export async function exportAgency(
	input: z.input<typeof AgencyExportInput>,
	write: (file: string, chunk: string) => Promise<void>
): Promise<AgencyExportManifest> {
	const { slug, operator } = AgencyExportInput.parse(input);
	return withService(
		async (tx) => {
			const agency = await agencyBySlug(tx, slug);
			if (!agency) throw new ServiceError('NOT_FOUND', 'Agency not found');
			const operationId = randomUUID();
			const tables = {} as Record<ExportTable, TableManifest>;
			for (const table of Object.keys(EXPORT_TABLES) as ExportTable[]) {
				const file = `${table}.csv`;
				const hash = createHash('sha256');
				const emit = async (text: string) => {
					hash.update(text);
					await write(file, text);
				};
				let rows = 0;
				let afterId: string | null = null;
				for (;;) {
					const page = await exportPage(tx, table, agency.id, afterId, PAGE);
					if (rows === 0) await emit(csvRows([page.columns]) + '\r\n');
					if (!page.rows.length) break;
					const body = page.rows.map((row) =>
						page.columns.map((c) => {
							const v = (row as Record<string, unknown>)[c];
							return cell(table === 'audit_log' && c.endsWith('_values') ? redact(v) : v);
						})
					);
					await emit(csvRows(body) + '\r\n');
					rows += page.rows.length;
					afterId = String((page.rows.at(-1) as { id: string }).id);
					if (page.rows.length < PAGE) break;
				}
				tables[table] = { file, rows, sha256: hash.digest('hex') };
			}
			const manifest: AgencyExportManifest = {
				operationId,
				agencyId: agency.id,
				exportedAt: new Date().toISOString(),
				format: 'csv',
				tables
			};
			await recordAgencyExport(tx, agency.id, manifest, operator);
			return manifest;
		},
		{ isolationLevel: 'repeatable read' }
	);
}
