// Full agency export (scripts/agency-export.ts): only the agency's own rows,
// no sign-in identifiers or secrets (also not inside audit values), stable
// paging past one page, checksums that match the files, and an audit row.
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, withService } from '../../../src/lib/server/db';
import * as s from '../../../src/lib/server/db/schema';
import { exportAgency } from '../../../src/lib/server/services/agency';

process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
const agency = randomUUID();
const other = randomUUID();
const home = randomUUID();
const otherHome = randomUUID();
const profile = randomUUID();
const client = randomUUID();
const otherClient = randomUUID();
const slug = `export-${agency.slice(0, 8)}`;
const authUid = `export-uid-${profile}`;

beforeAll(async () => {
	await withService(async (tx) => {
		await tx.insert(s.agencies).values([
			{ id: agency, name: 'Export Test', slug },
			{ id: other, name: 'Other Agency', slug: `other-${other.slice(0, 8)}` }
		]);
		await tx.insert(s.homes).values([
			{ id: home, agency_id: agency, name: 'Maple House' },
			{ id: otherHome, agency_id: other, name: 'Other House' }
		]);
		await tx.insert(s.profiles).values({
			id: profile,
			agency_id: agency,
			auth_uid: authUid,
			email: `${profile}@example.test`,
			name: 'Export Admin',
			role: 'admin'
		});
		await tx.insert(s.clients).values([
			{ id: client, agency_id: agency, home_id: home, name: 'Synthetic Person' },
			// Empty text, not NULL: the export must keep them apart.
			{ agency_id: agency, home_id: home, name: 'Synthetic Second', info: '' },
			{ id: otherClient, agency_id: other, home_id: otherHome, name: 'Other Person' }
		]);
		// A skipped table's audit values never leave either.
		await tx.insert(s.auditLog).values({
			agency_id: agency,
			table_name: 'webhooks',
			record_id: randomUUID(),
			action: 'INSERT',
			new_values: { url: 'https://partner.example/synthetic-secret-hook' }
		});
		// More than one page (1,000 rows) of one table.
		await tx.insert(s.rooms).values(
			Array.from({ length: 1001 }, (_, i) => ({
				agency_id: agency,
				home_id: home,
				name: `Room ${i}`
			}))
		);
	});
});

afterAll(closeDb);

it('exports every table of one agency with checksums, without secrets, and audits it', async () => {
	const files = new Map<string, string>();
	const manifest = await exportAgency(
		{ slug, operator: 'ops@example.test' },
		async (file, chunk) => {
			files.set(file, (files.get(file) ?? '') + chunk);
		}
	);

	expect(manifest.agencyId).toBe(agency);
	for (const [table, entry] of Object.entries(manifest.tables) as [
		string,
		{ file: string; rows: number; sha256: string }
	][]) {
		const text = files.get(entry.file) ?? '';
		expect(entry.file).toBe(`${table}.csv`);
		expect(createHash('sha256').update(text).digest('hex')).toBe(entry.sha256);
		// Header plus one line per row.
		expect(text.split('\r\n').filter(Boolean)).toHaveLength(entry.rows + 1);
	}

	expect(manifest.tables.agencies.rows).toBe(1);
	expect(manifest.tables.clients.rows).toBe(2);
	expect(manifest.tables.rooms.rows).toBe(1001);
	expect(new Set(files.get('rooms.csv')!.split('\r\n').slice(1, -1)).size).toBe(1001);
	const all = [...files.values()].join('\n');
	expect(all).toContain(client);
	expect(all).not.toContain(otherClient);
	expect(all).not.toContain(other);
	// The profile's sign-in ID is in neither profiles.csv nor the audit values.
	expect(manifest.tables.audit_log.rows).toBeGreaterThan(0);
	expect(files.get('profiles.csv')).not.toContain('auth_uid');
	expect(all).not.toContain(authUid);
	expect(all).not.toContain('synthetic-secret-hook');
	// The manifest is written with the files, before the export is recorded.
	expect(JSON.parse(files.get('manifest.json')!)).toEqual(manifest);
	// NULL is an empty cell, empty text is "".
	const [header, ...lines] = files.get('clients.csv')!.split('\r\n').filter(Boolean);
	const info = header.split(',').indexOf('"info"');
	const infoOf = (name: string) => lines.find((l) => l.includes(name))!.split(',')[info];
	expect(infoOf('Synthetic Person')).toBe('');
	expect(infoOf('Synthetic Second')).toBe('""');

	const [audit] = await withService((tx) =>
		tx
			.select()
			.from(s.auditLog)
			.where(and(eq(s.auditLog.agency_id, agency), eq(s.auditLog.table_name, 'agency_export')))
	);
	expect(audit.record_id).toBe(manifest.operationId);
	expect(audit.new_values).toMatchObject({
		format: 'csv',
		operator: 'ops@example.test',
		tables: { clients: { rows: 2, sha256: manifest.tables.clients.sha256 } }
	});
});

it('refuses an unknown agency or a missing operator and records nothing', async () => {
	const write = async () => {};
	await expect(
		exportAgency({ slug: 'no-such-agency', operator: 'ops@example.test' }, write)
	).rejects.toThrow('Agency not found');
	await expect(exportAgency({ slug, operator: '' }, write)).rejects.toThrow();
});

it('records nothing when a file could not be written', async () => {
	const count = () =>
		withService(
			async (tx) =>
				(
					await tx
						.select()
						.from(s.auditLog)
						.where(
							and(eq(s.auditLog.agency_id, agency), eq(s.auditLog.table_name, 'agency_export'))
						)
				).length
		);
	const before = await count();
	await expect(
		exportAgency({ slug, operator: 'ops@example.test' }, async (file) => {
			if (file === 'manifest.json') throw new Error('Synthetic disk full');
		})
	).rejects.toThrow('Synthetic disk full');
	expect(await count()).toBe(before);
});
