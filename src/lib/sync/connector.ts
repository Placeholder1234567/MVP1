import type { AbstractPowerSyncDatabase, PowerSyncBackendConnector } from '@powersync/web';
import * as env from '$app/env/public';
import { getSyncToken } from '#lib/auth/firebase.ts';

/**
 * Connects the local database to PowerSync (offline-sync.md §3).
 * Reads: PowerSync streams rows chosen by the sync streams.
 * Writes: will go through the sync.upload tRPC procedure. Until that exists,
 * uploadData keeps every queued change (it throws, so PowerSync retries later)
 * instead of acknowledging and losing it.
 */
export class GuadConnector implements PowerSyncBackendConnector {
	async fetchCredentials() {
		const { token, expiresAt } = await getSyncToken();
		return {
			endpoint: env.PUBLIC_POWERSYNC_URL || 'http://localhost:8080',
			token,
			expiresAt
		};
	}

	async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
		const tx = await database.getNextCrudTransaction();
		if (!tx) return;
		throw new Error('Offline uploads are not enabled yet; changes stay queued on this device');
	}
}
