import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { poolConfig } from './pool';
import * as schema from './schema';

/** Who the request is for. Always built from the profile row, never from token claims. */
export interface Claims {
	agency_id: string;
	role: 'caregiver' | 'supervisor' | 'admin';
	profile_id: string;
}

/** Request details recorded by the audit_row_change trigger. */
export interface RequestInfo {
	ip?: string;
	user_agent?: string;
}

// Never log a query error as-is: Drizzle's error message includes the query's
// parameters, which can be client data (CLAUDE.md: no PHI in logs). Log an
// operation ID and the Postgres error code (err.cause.code) instead.

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

let pool: pg.Pool | undefined;
let db: Db | undefined;

/** Lazily connects so importing this module never opens a connection. */
export function getDb(): Db {
	if (!db) {
		// DATABASE_URL locally, Cloud SQL with IAM sign-in on Cloud Run (pool.ts).
		pool = new pg.Pool(poolConfig());
		db = drizzle(pool, { schema });
	}
	return db;
}

export async function closeDb(): Promise<void> {
	await pool?.end();
	pool = undefined;
	db = undefined;
}

/**
 * Runs fn in a transaction as app_user with the caller's claims, so every RLS
 * policy and integrity trigger applies (infrastructure.md §4). Use for every
 * request made on behalf of a signed-in user.
 *
 * Together with withService this is the only raw SQL in the app.
 */
export function withUser<T>(
	claims: Claims,
	request: RequestInfo,
	fn: (tx: Tx) => Promise<T>
): Promise<T> {
	return inTransaction(async (tx) => {
		await tx.execute(sql`SET LOCAL ROLE app_user`);
		await tx.execute(
			sql`SELECT set_config('app.claims', ${JSON.stringify(claims)}, true),
			           set_config('app.request', ${JSON.stringify(request)}, true)`
		);
		return fn(tx);
	});
}

/**
 * Runs fn inside the caller's existing transaction as app_service, then
 * restores the previous role. For a cross-user write that must commit or roll
 * back together with the user's own change (e.g. alerting supervisors about a
 * possible double dose). Same limits as withService.
 */
export async function asService<T>(tx: Tx, fn: (tx: Tx) => Promise<T>): Promise<T> {
	const { rows } = await tx.execute<{ role: string }>(sql`SELECT current_setting('role') AS role`);
	const previous = rows[0]?.role;
	await tx.execute(sql`SET LOCAL ROLE app_service`);
	try {
		return await fn(tx);
	} finally {
		if (previous === 'app_user') await tx.execute(sql`SET LOCAL ROLE app_user`);
	}
}

/**
 * Runs fn as app_service, which bypasses RLS. Only for job handlers and the
 * cross-user writes listed at the end of rls.sql; never for a user's own request.
 */
export function withService<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
	return inTransaction(async (tx) => {
		await tx.execute(sql`SET LOCAL ROLE app_service`);
		return fn(tx);
	});
}

// ─── After-commit hooks ──────────────────────────────────────────────────────
// Work that must only happen once a transaction has committed, such as queuing
// a job that will read the rows just written. Without this, a fast job could
// run before the commit and find nothing.

const pending = new AsyncLocalStorage<Array<() => unknown>>();

async function inTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
	const outer = pending.getStore();
	if (outer) return getDb().transaction(fn); // nested: the outermost commit runs the hooks
	const hooks: Array<() => unknown> = [];
	const result = await pending.run(hooks, () => getDb().transaction(fn));
	for (const hook of hooks) {
		try {
			await hook();
		} catch (e) {
			// The transaction is already committed; a failed hook must not undo
			// the user's change. Hooks are backed by a sweeper job (see jobs/).
			console.error(`after-commit hook failed: ${(e as Error).name}`);
		}
	}
	return result;
}

/**
 * Runs fn after the surrounding withUser()/withService() transaction commits,
 * or right away when called outside one. Never runs if the transaction rolls
 * back. A hook registered inside a savepoint that later rolls back still runs,
 * so hooks must check that what they act on exists.
 */
export function afterCommit(fn: () => unknown): void {
	const hooks = pending.getStore();
	if (hooks) hooks.push(fn);
	else void Promise.resolve().then(fn);
}
