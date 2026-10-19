// Changes an agency's plan: its tier and per-agency extra features
// (entitlements.md "v1 constraints": upgrades go through support, there is
// no self-service). Operator tool: run against the target database
// (deploy/README.md). The change is recorded in the agency's audit log with
// who made it, and staff devices pick up the new features on their next sync.
//
//   npm run agency:set-plan -- --slug sunrise-care --tier complete --operator ops@example.org
//   npm run agency:set-plan -- --slug sunrise-care --feature intake --feature analytics \
//     --operator ops@example.org [--dry-run]
//   npm run agency:set-plan -- --slug sunrise-care --clear-features --operator ops@example.org
import { parseArgs } from 'node:util';
import { closeDb, withService } from '../src/lib/server/db';
import { setAgencyPlan } from '../src/lib/server/services/agency/index.ts';

const { values } = parseArgs({
	options: {
		slug: { type: 'string' },
		tier: { type: 'string' },
		feature: { type: 'string', multiple: true },
		'clear-features': { type: 'boolean', default: false },
		operator: { type: 'string' },
		'dry-run': { type: 'boolean', default: false }
	}
});

try {
	if (values.feature?.length && values['clear-features'])
		throw new Error('Use --feature or --clear-features, not both');
	const features = values['clear-features'] ? [] : values.feature;
	const result = await withService((tx) =>
		setAgencyPlan(
			tx,
			{
				slug: values.slug ?? '',
				tier: values.tier as 'starter' | undefined,
				features: features as ['charting'] | undefined,
				operator: values.operator ?? ''
			},
			{ dryRun: values['dry-run'] }
		)
	);
	const extras = (f: string[]) => (f.length ? f.join(', ') : 'none');
	console.log(
		`${values['dry-run'] ? 'Would change' : 'Changed'} agency ${result.agencyId}: ` +
			`tier ${result.before.tier} -> ${result.after.tier}; ` +
			`extra features ${extras(result.before.features)} -> ${extras(result.after.features)}.`
	);
	console.log(`Effective features: ${result.effective.join(', ')}`);
} catch (e) {
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
