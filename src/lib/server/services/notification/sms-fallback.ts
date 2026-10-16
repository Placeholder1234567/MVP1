import { afterCommit, type Tx } from '../../db';
import { enqueue } from '../../jobs/queue';
import { createSmsPushFallback } from './sms-fallback.queries';

/** A committed pending push is also recoverable by the existing notification sweeper. */
export async function queueSmsPushFallback(tx: Tx, agencyId: string, smsId: string): Promise<void> {
	const id = await createSmsPushFallback(tx, agencyId, smsId);
	if (id)
		afterCommit(() =>
			enqueue('notifications-push', { ids: [id] }, { taskName: `sms-fallback-${smsId}` })
		);
}
