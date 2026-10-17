// Creates a new agency (services.md §2 provisionAgency): the agency, its
// default goal templates and its first admin, who gets an email with a
// password-setup link. Operator tool: run against the target database with
// Identity Platform credentials (deploy/README.md "New agencies").
//
//   npm run agency:provision -- --name "Sunrise Care" --slug sunrise-care \
//     --tier professional --admin-email admin@example.org --admin-name "Ada Admin" \
//     [--timezone America/Chicago] [--preset therap] [--print-setup-link]
import { parseArgs } from 'node:util';
import { closeDb, withService } from '../src/lib/server/db';
import { passwordSetupLink } from '../src/lib/server/identity';
import { provisionAgency } from '../src/lib/server/services/agency/index.ts';

const { values } = parseArgs({
	options: {
		name: { type: 'string' },
		slug: { type: 'string' },
		tier: { type: 'string' },
		timezone: { type: 'string' },
		preset: { type: 'string' },
		'admin-email': { type: 'string' },
		'admin-name': { type: 'string' },
		// When email isn't set up yet (local, staging): show the link here instead.
		'print-setup-link': { type: 'boolean', default: false }
	}
});

/** Input field to the flag the operator typed. */
const FLAG: Record<string, string> = {
	adminEmail: 'admin-email',
	adminName: 'admin-name',
	chartingPreset: 'preset'
};

try {
	const result = await withService((tx) =>
		provisionAgency(tx, {
			name: values.name ?? '',
			slug: values.slug ?? '',
			tier: values.tier as 'starter',
			timezone: values.timezone,
			chartingPreset: values.preset as 'default' | undefined,
			adminEmail: values['admin-email'] ?? '',
			adminName: values['admin-name'] ?? ''
		})
	);
	console.log(
		`Agency ${result.agencyId} created with ${result.templates} goal templates; admin ${result.adminProfileId} invited.`
	);
	if (values['print-setup-link']) {
		const appUrl = process.env.APP_URL ?? 'http://localhost:5173';
		console.log(
			`Setup link: ${await passwordSetupLink(values['admin-email']!.trim().toLowerCase(), `${appUrl}/login`)}`
		);
	}
} catch (e) {
	const issues = (e as { issues?: { path: string[]; message: string }[] }).issues;
	console.error(
		issues
			? issues.map((i) => `--${i.path.join('.')}: ${i.message}`).join('\n')
			: (e as Error).message
	);
	process.exitCode = 1;
} finally {
	await closeDb();
}
