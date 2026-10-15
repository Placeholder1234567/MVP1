import { error, json } from '@sveltejs/kit';
import { isGoogleSignedJobRequest } from '#lib/server/jobs/oidc.ts';
import { jobsDriver } from '#lib/server/jobs/queue.ts';
import { isJob, runJob } from '#lib/server/jobs/registry.ts';
import type { RequestHandler } from './$types';

/**
 * Job handlers, called by Cloud Tasks and Cloud Scheduler on the worker
 * service only (infrastructure.md §2, §5). A 2xx tells Cloud Tasks the job is
 * done; anything else makes it retry with the queue's backoff.
 */
export const POST: RequestHandler = async ({ params, request }) => {
	// Not served by the web service, and not used by the local driver.
	if (process.env.GUAD_SERVICE !== 'worker' || jobsDriver() !== 'cloud-tasks')
		error(404, 'Not found');
	if (!(await isGoogleSignedJobRequest(request.headers.get('authorization')))) {
		error(401, 'Not a signed job request');
	}
	if (!isJob(params.name)) error(404, 'Unknown job');

	const payload = await request.json().catch(() => ({}));
	const attempt = Number(request.headers.get('x-cloudtasks-taskretrycount') ?? 0);
	const maxAttempts = Number(request.headers.get('x-guad-max-attempts') ?? 0);
	await runJob(params.name, payload, {
		attempt,
		final: maxAttempts > 0 && attempt + 1 >= maxAttempts
	});
	return json({ ok: true });
};
