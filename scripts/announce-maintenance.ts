// Announces scheduled maintenance to every agency on the platform
// (notifications.md §2.18): the same fixed, PHI-free wording an agency admin
// sends from Setup, in each agency's time zone. Operator tool: run against
// the target database before a platform-wide maintenance window.
//
//   npm run maintenance:announce -- --start 2026-11-01T03:00:00Z \
//     --end 2026-11-01T05:00:00Z --impact unavailable [--id <uuid>] [--dry-run]
//
// --id names the announcement. Running again with the same --id sends
// nothing new, so a run that stopped halfway can simply be repeated.
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { closeDb, withService } from '../src/lib/server/db';
import {
	announceMaintenance,
	MaintenanceInput,
	platformAgencies,
	platformAnnouncementId
} from '../src/lib/server/services/notification/index.ts';
import { MAINTENANCE_IMPACTS, maintenanceWindowError } from '../src/lib/domain/index.ts';

const { values } = parseArgs({
	options: {
		start: { type: 'string' },
		end: { type: 'string' },
		impact: { type: 'string' },
		id: { type: 'string' },
		'dry-run': { type: 'boolean', default: false }
	}
});

try {
	const runId = values.id ?? randomUUID();
	const input = MaintenanceInput.omit({ id: true }).parse({
		startsAt: values.start,
		endsAt: values.end,
		impact: values.impact
	});
	const problem = maintenanceWindowError(input.startsAt, input.endsAt, new Date());
	if (problem) throw new Error(problem);
	const agencies = await withService((tx) => platformAgencies(tx));
	console.log(
		`Announcement ${runId}: ${agencies.length} agencies, impact "${input.impact}" (${MAINTENANCE_IMPACTS[input.impact]})`
	);
	if (values['dry-run']) console.log('Dry run: nothing sent.');
	else {
		let sent = 0,
			skipped = 0,
			empty = 0,
			failed = 0,
			people = 0;
		for (const agencyId of agencies) {
			try {
				// One transaction per agency: a failure doesn't stop the rest.
				const r = await withService((tx) =>
					announceMaintenance(tx, agencyId, {
						...input,
						id: platformAnnouncementId(runId, agencyId)
					})
				);
				if (r.alreadySent) skipped++;
				// Nothing is recorded for an agency with no active staff, so it never counts as sent.
				else if (!r.recipients) empty++;
				else {
					sent++;
					people += r.recipients;
				}
			} catch (e) {
				failed++;
				// Agency IDs only: no names or staff details in operator output.
				console.error(`Agency ${agencyId}: ${(e as Error).message}`);
			}
		}
		console.log(
			`Sent to ${sent} agencies (${people} people); ${skipped} already had it; ${empty} have no active staff; ${failed} failed.` +
				(failed ? ` Run again with --id ${runId} to retry.` : '')
		);
		if (failed) process.exitCode = 1;
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
