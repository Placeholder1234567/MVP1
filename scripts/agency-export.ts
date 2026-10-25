// Writes a full copy of one agency's records (security.md "Agency data
// export"): one CSV per table plus manifest.json with row counts and SHA-256
// checksums, read in one database snapshot. Operator tool, no app endpoint.
// The folder is created here (it must not exist yet) and readable only by the
// operator; it holds PHI, so move it only over the channel agreed with the
// agency and delete the local copy once delivered. The export is recorded in
// the agency's audit log with the operator.
//
//   npm run agency:export -- --slug sunrise-care --operator ops@example.org --out ./sunrise-export
import { mkdir, rm, writeFile, appendFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { closeDb } from '../src/lib/server/db';
import { exportAgency } from '../src/lib/server/services/agency/index.ts';

const { values } = parseArgs({
	options: {
		slug: { type: 'string' },
		operator: { type: 'string' },
		out: { type: 'string' }
	}
});

let created: string | null = null;
try {
	if (!values.out) throw new Error('--out: the folder to create for the export');
	const out = resolve(values.out);
	// Fails if the folder exists, so an export never mixes with other files.
	await mkdir(out, { mode: 0o700 });
	created = out;
	const opened = new Set<string>();
	const manifest = await exportAgency(
		{ slug: values.slug ?? '', operator: values.operator ?? '' },
		async (file, chunk) => {
			const path = join(out, file);
			if (!opened.has(file)) {
				opened.add(file);
				await writeFile(path, chunk, { mode: 0o600, flag: 'wx' });
			} else await appendFile(path, chunk);
		}
	);
	await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {
		mode: 0o600,
		flag: 'wx'
	});
	created = null;
	const tables = Object.values(manifest.tables);
	const rows = tables.reduce((sum, t) => sum + t.rows, 0);
	console.log(
		`Exported agency ${manifest.agencyId}: ${tables.length} tables, ${rows} rows, to ${out} ` +
			`(operation ${manifest.operationId}).`
	);
	console.log(
		'Board photo files are not included (message_photos lists them); copy them from MEDIA_BUCKET separately if needed.'
	);
} catch (e) {
	if (created) await rm(created, { recursive: true, force: true });
	const issues = (e as { issues?: { path: string[]; message: string }[] }).issues;
	console.error(
		issues
			? issues.map((i) => `--${i.path.join('.') || 'input'}: ${i.message}`).join('\n')
			: (e as Error).message
	);
	process.exitCode = 1;
} finally {
	await closeDb();
}
