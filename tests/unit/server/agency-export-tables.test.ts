// Every agency table is either in the full export or skipped with a reason,
// so a new table can't drop out of an agency's data export unnoticed.
import { is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { expect, it } from 'vitest';
import * as schema from '../../../src/lib/server/db/schema';
import {
	EXPORT_TABLES,
	SKIPPED_TABLES
} from '../../../src/lib/server/services/agency/export.queries';

it('exports or explicitly skips every agency table', () => {
	const tables = Object.values(schema)
		.filter((v): v is PgTable => is(v, PgTable))
		.map((t) => getTableConfig(t))
		.filter((c) => c.name === 'agencies' || c.columns.some((col) => col.name === 'agency_id'))
		.map((c) => c.name)
		.sort();
	const covered = [...Object.keys(EXPORT_TABLES), ...Object.keys(SKIPPED_TABLES)].sort();
	expect(covered).toEqual(tables);
	for (const name of Object.keys(EXPORT_TABLES))
		expect(getTableConfig(EXPORT_TABLES[name as keyof typeof EXPORT_TABLES]).name).toBe(name);
});
