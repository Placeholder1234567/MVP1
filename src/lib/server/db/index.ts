import pg from 'pg';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
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
		// Local dev uses DATABASE_URL. On Cloud Run this becomes the Cloud SQL
		// connector with IAM auth (infrastructure.md §2).
		const url = process.env.DATABASE_URL;
		if (!url) throw new Error('DATABASE_URL is not set');
		pool = new pg.Pool({ connectionString: url, max: 10 });
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
	return getDb().transaction(async (tx) => {
		await tx.execute(sql`SET LOCAL ROLE app_user`);
		await tx.execute(
			sql`SELECT set_config('app.claims', ${JSON.stringify(claims)}, true),
			           set_config('app.request', ${JSON.stringify(request)}, true)`
		);
		return fn(tx);
	});
}

/**
 * Runs fn as app_service, which bypasses RLS. Only for job handlers and the
 * cross-user writes listed at the end of rls.sql; never for a user's own request.
 */
export function withService<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
	return getDb().transaction(async (tx) => {
		await tx.execute(sql`SET LOCAL ROLE app_service`);
		return fn(tx);
	});
}
