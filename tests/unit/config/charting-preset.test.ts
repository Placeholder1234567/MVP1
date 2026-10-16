import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chartingLabels } from '../../../src/lib/config/charting-preset';

describe('charting presets (charting-ux.md §2)', () => {
	it('give both presets the same label keys, with different words', () => {
		const therap = chartingLabels('therap');
		const plain = chartingLabels('default');
		expect(Object.keys(therap).sort()).toEqual(Object.keys(plain).sort());
		expect(therap.shift).toBe('T-Log');
		expect(therap.medications).toBe('eMAR');
		expect(plain.shift).not.toBe(therap.shift);
		// Unknown or missing presets fall back to the default labels.
		expect(chartingLabels(undefined)).toEqual(plain);
		expect(chartingLabels('something-else')).toEqual(plain);
	});

	it('never branch server logic on the preset (CLAUDE.md "NO schema branching")', () => {
		const root = 'src/lib/server';
		const files: string[] = [];
		const walk = (dir: string) => {
			for (const name of readdirSync(dir)) {
				const path = join(dir, name);
				if (statSync(path).isDirectory()) walk(path);
				else if (/\.(ts|js)$/.test(name)) files.push(path);
			}
		};
		walk(root);
		const readers = files
			.filter((f) => /charting_?preset/i.test(readFileSync(f, 'utf8')))
			.map((f) => relative('.', f).replace(/\\/g, '/'))
			.sort();
		// Only the schema and agency.get, which hands the preset to the UI.
		const allowed = ['src/lib/server/db/schema.ts', 'src/lib/server/services/agency/index.ts'];
		expect(readers.filter((f) => !allowed.includes(f))).toEqual([]);
		expect(readers).toContain('src/lib/server/services/agency/index.ts');
	});
});
