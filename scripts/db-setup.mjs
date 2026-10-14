// Creates or updates the dev database: Drizzle migrations, then RLS policies,
// integrity triggers and role grants from .specify/rls.sql.
//   node scripts/db-setup.mjs           apply what's missing
//   node scripts/db-setup.mjs --reset   drop everything first (dev only)
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const url = process.env.DATABASE_URL ?? 'postgres://guad:guad@localhost:5433/guad';
const reset = process.argv.includes('--reset');
const pool = new pg.Pool({ connectionString: url });

try {
	if (reset) {
		if (!/localhost|127\.0\.0\.1/.test(url))
			throw new Error('--reset only runs against a local database');
		await pool.query(
			'DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS app CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;'
		);
		console.log('reset: dropped schemas');
	}

	await migrate(drizzle(pool), { migrationsFolder: 'drizzle' });
	console.log('migrations: up to date');

	// rls.sql creates policies with plain CREATE, so it runs once per database.
	const { rows } = await pool.query("SELECT to_regprocedure('app.claims()') IS NOT NULL AS done");
	if (rows[0].done) {
		console.log('rls.sql: already applied (use --reset to re-apply after editing it)');
	} else {
		await pool.query('BEGIN');
		await pool.query(readFileSync('.specify/rls.sql', 'utf8'));
		await pool.query('COMMIT');
		console.log('rls.sql: applied');
	}

	// Grants run every time so tables added by later migrations are covered.
	await pool.query(`
		GRANT USAGE ON SCHEMA public, app TO app_user, app_service;
		GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user, app_service;
		GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user, app_service;
		REVOKE DELETE, TRUNCATE ON public.audit_log FROM app_user;
		GRANT app_user, app_service TO CURRENT_USER;
	`);
	console.log('grants: applied');
} catch (err) {
	await pool.query('ROLLBACK').catch(() => {});
	console.error(err.message);
	process.exitCode = 1;
} finally {
	await pool.end();
}
