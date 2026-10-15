import type { AbstractPowerSyncDatabase, PowerSyncBackendConnector } from '@powersync/web';
import * as env from '$app/env/public';
import { getSyncToken } from '#lib/auth/firebase.ts';
import { trpc } from '#lib/trpc.ts';

/**
 * Connects the local database to PowerSync (offline-sync.md §3).
 * Reads: PowerSync streams the rows chosen by the sync streams.
 * Writes: each queued transaction goes to sync.upload, which applies it
 * through the same services as the online API.
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

	/**
	 * Uploads the oldest queued transaction. Rejected changes are kept in
	 * failed_writes and the transaction is completed, so one bad change never
	 * blocks the rest of the queue (offline-sync.md §6). Network and server
	 * errors throw instead: PowerSync keeps the transaction and retries.
	 */
	async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
		const tx = await database.getNextCrudTransaction();
		if (!tx) return;

		const result = await trpc.sync.upload.mutate({
			transactionId: tx.transactionId ?? 0,
			ops: tx.crud.map((e) => ({
				op: e.op as 'PUT' | 'PATCH' | 'DELETE',
				table: e.table,
				id: e.id,
				data: e.opData ?? null
			}))
		});

		const now = new Date().toISOString();
		await database.writeTransaction(async (w) => {
			for (const r of result.rejected) {
				const entry = tx.crud.find((e) => e.id === r.id && e.table === r.table);
				await w.execute(
					`INSERT INTO failed_writes (id, record_id, table_name, op, code, message, data, failed_at)
					 VALUES (uuid(), ?, ?, ?, ?, ?, ?, ?)`,
					[
						r.id,
						r.table,
						entry?.op ?? '',
						r.code,
						r.message,
						JSON.stringify(entry?.opData ?? {}),
						now
					]
				);
			}
			for (const n of result.notices) {
				await w.execute(
					`INSERT INTO sync_notices (id, record_id, table_name, code, message, created_at, seen)
					 VALUES (uuid(), ?, ?, ?, ?, ?, 0)`,
					[n.id, n.table, n.code, n.message, now]
				);
			}
		});
		await tx.complete();
	}
}
