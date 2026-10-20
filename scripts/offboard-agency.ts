// Operator-only. Default is read-only; execution requires the exact agency ID twice.
import { parseArgs } from 'node:util';
import { closeDb } from '../src/lib/server/db';
import { offboardAgency } from '../src/lib/server/services/agency/index.ts';
const { values } = parseArgs({
	options: {
		'agency-id': { type: 'string' },
		operator: { type: 'string' },
		execute: { type: 'boolean', default: false },
		'confirm-agency-id': { type: 'string' }
	}
});
try {
	const result = await offboardAgency(
		{
			agencyId: values['agency-id'] ?? '',
			operator: values.operator ?? '',
			confirmAgencyId: values['confirm-agency-id']
		},
		{ dryRun: !values.execute }
	);
	console.log(
		`${result.dryRun ? 'Preview' : 'Offboarding'} agency ${result.agencyId}: ${result.phase}; ` +
			`active profiles ${result.counts.activeProfiles}, API keys ${result.counts.activeApiKeys}, webhooks ${result.counts.activeWebhooks}; ` +
			`identity failures ${result.identityFailures}.`
	);
	if (!result.dryRun)
		console.log(
			'Clinical and audit data retained. Verify infrastructure retention separately; no destruction certificate was issued.'
		);
	if (result.identityFailures) process.exitCode = 1;
} catch {
	// Never print database/provider errors: they can contain account details.
	console.error(
		'Offboarding did not complete. Verify the input and inspect operator status before retrying.'
	);
	process.exitCode = 1;
} finally {
	await closeDb();
}
