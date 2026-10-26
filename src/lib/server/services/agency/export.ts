// Full agency data export (security.md "Agency data export"): a copy of every
// record the agency holds, for returning data when it leaves (HIPAA business
// associate terms, 45 CFR 164.504(e)(2)(ii)(J)) or on its request. Operator
// only: no tRPC or API exposure. All tables are read in one repeatable-read
// snapshot, so files agree with each other, and the export is recorded in the
// agency's audit log with the operator, row counts and file checksums.
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { csvCell } from '../../../domain/index.ts';
import { withService } from '../../db';
import { ServiceError } from '../../errors';
import { agencyBySlug, recordAgencyExport } from './agency.queries';
import {
	DROPPED_COLUMNS,
	EXPORT_TABLES,
	exportPage,
	SKIPPED_TABLES,
	type ExportTable
} from './export.queries';

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
	/** When the snapshot was taken: records saved later are not in it */
	exportedAt: string;
	format: 'csv';
	/** How to read the files */
	notes: string[];
	tables: Record<ExportTable, TableManifest>;
}

const NOTES = [
	'One CSV per table, all read in one database snapshot taken at exportedAt.',
	'An empty unquoted cell is NULL; "" is an empty text value.',
	"Text starting with = + - @, a tab or a carriage return has a ' added in front, so spreadsheets don't run it as a formula.",
	'Lists and structured values are JSON text in their cell.'
];

const PAGE = 1000;

/**
 * audit_log before/after values, without what the export leaves out: all of
 * a skipped table's values (a webhook's URL, say), and the dropped columns
 * of an exported one (a profile's auth_uid).
 */
function redact(auditedTable: unknown, value: unknown): unknown {
	if (typeof auditedTable === 'string' && Object.hasOwn(SKIPPED_TABLES, auditedTable)) return null;
	if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
	const dropped = DROPPED_COLUMNS[String(auditedTable)] ?? [];
	return Object.fromEntries(Object.entries(value).filter(([k]) => !dropped.includes(k)));
}

/** A CSV cell that keeps NULL (empty) apart from empty text (""). */
function cell(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (value instanceof Date) return csvCell(value.toISOString());
	if (typeof value === 'number') return csvCell(value);
	if (typeof value === 'object') return csvCell(JSON.stringify(value));
	return csvCell(String(value));
}
const line = (cells: string[]) => cells.join(',') + '\r\n';

/**
 * Streams each table as CSV text to `write` (header first, then pages), in
 * EXPORT_TABLES order, then manifest.json. The export is recorded only once
 * every write has succeeded; on any error nothing is recorded and the caller
 * should discard what it wrote.
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
			const exportedAt = new Date().toISOString();
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
					if (rows === 0) await emit(line(page.columns.map((c) => csvCell(c))));
					if (!page.rows.length) break;
					await emit(
						page.rows
							.map((row) => {
								const r = row as Record<string, unknown>;
								return line(
									page.columns.map((c) =>
										cell(
											table === 'audit_log' && c.endsWith('_values')
												? redact(r.table_name, r[c])
												: r[c]
										)
									)
								);
							})
							.join('')
					);
					rows += page.rows.length;
					afterId = String((page.rows.at(-1) as { id: string }).id);
					if (page.rows.length < PAGE) break;
				}
				tables[table] = { file, rows, sha256: hash.digest('hex') };
			}
			const manifest: AgencyExportManifest = {
				operationId,
				agencyId: agency.id,
				exportedAt,
				format: 'csv',
				notes: NOTES,
				tables
			};
			// Written before the export is recorded: a failed write rolls the record back.
			await write('manifest.json', JSON.stringify(manifest, null, 2) + '\n');
			await recordAgencyExport(tx, agency.id, manifest, operator);
			return manifest;
		},
		{ isolationLevel: 'repeatable read' }
	);
}
