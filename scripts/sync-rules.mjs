// Builds powersync/sync-config.yaml from the Sync Streams in .specify/offline-sync.md §4,
// so the spec stays the single source of truth.
//   node scripts/sync-rules.mjs          write the file
//   node scripts/sync-rules.mjs --check  fail if the file is out of date (CI)
// Also exports syncedTables() for db-setup.mjs (publication and grants).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SPEC = '.specify/offline-sync.md';
const OUT = 'powersync/sync-config.yaml';
const HEADER =
	'# Generated from .specify/offline-sync.md §4 by scripts/sync-rules.mjs. Edit the spec, then regenerate.\n';

export function buildSyncConfig() {
	const spec = readFileSync(SPEC, 'utf8').replace(/\r\n/g, '\n');
	const section = spec.split('## 4. Sync Streams')[1]?.split('\n## 5.')[0];
	if (!section) throw new Error(`${SPEC}: section "## 4. Sync Streams" not found`);
	const block = [...section.matchAll(/```yaml\n([\s\S]*?)```/g)]
		.map((m) => m[1])
		.find((b) => /^streams:$/m.test(b));
	if (!block) throw new Error(`${SPEC}: no yaml block with "streams:" in section 4`);
	return HEADER + block;
}

/** Tables the sync streams read data from (the PowerSync publication needs exactly these). */
export function syncedTables(config = buildSyncConfig()) {
	// The outer FROM of each stream query (subqueries only read profiles, which is synced anyway).
	return [
		...new Set([...config.matchAll(/^\s+SELECT .* FROM ([a-z_]+)$/gm)].map((m) => m[1]))
	].sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const config = buildSyncConfig();
	if (process.argv.includes('--check')) {
		const current = readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n');
		if (current !== config) {
			console.error(`${OUT} is out of date with ${SPEC}. Run: node scripts/sync-rules.mjs`);
			process.exit(1);
		}
		console.log(`${OUT}: up to date (${syncedTables(config).length} tables)`);
	} else {
		writeFileSync(OUT, config);
		console.log(`${OUT}: written (${syncedTables(config).length} tables)`);
	}
}
