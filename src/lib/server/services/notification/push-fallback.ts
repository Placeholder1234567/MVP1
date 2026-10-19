import { afterCommit, type Tx } from '../../db';
import { enqueue } from '../../jobs/queue';
import { createPushSmsFallback } from './push-fallback.queries';

/**
 * Texts a mandatory alert whose push failed for good (no device, or out of
 * retries). A committed pending SMS is also picked up by the sweeper.
 */
export async function queuePushSmsFallback(tx: Tx, agencyId: string, pushId: string) {
	const id = await createPushSmsFallback(tx, agencyId, pushId);
	if (id)
		afterCommit(() =>
			enqueue('notifications-sms', { ids: [id] }, { taskName: `push-fallback-${pushId}` })
		);
}
