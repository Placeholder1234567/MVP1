// Creates or updates the database: Drizzle migrations, then RLS policies,
// integrity triggers and role grants from .specify/rls.sql.
//   node scripts/db-setup.mjs           apply what's missing
//   node scripts/db-setup.mjs --reset   drop everything first (dev only)
// In production this is the `migrate` Cloud Run job (deploy/README.md):
// CLOUD_SQL_INSTANCE is set, and DB_RUNTIME_USERS lists the service accounts
// (web, worker; comma or semicolon separated) whose IAM database users may
// act as app_user / app_service.
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { iamDbUser, poolConfig } from '../src/lib/server/db/pool.ts';
import { syncedTables } from './sync-rules.mjs';

const cloud = Boolean(process.env.CLOUD_SQL_INSTANCE);
if (!cloud) process.env.DATABASE_URL ??= 'postgres://guad:guad@localhost:5433/guad';
const reset = process.argv.includes('--reset');
const pool = new pg.Pool(poolConfig(2));

try {
	if (reset) {
		if (cloud || !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL))
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
	const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;
	const runtimeUsers = (process.env.DB_RUNTIME_USERS ?? '')
		.split(/[,;]/)
		.map((s) => s.trim())
		.filter(Boolean);
	for (const sa of runtimeUsers) {
		// Membership is what lets withUser()/withService() SET LOCAL ROLE.
		await pool.query(`GRANT app_user, app_service TO ${ident(iamDbUser(sa))}`);
	}
	console.log(
		`grants: applied${runtimeUsers.length ? ` (+${runtimeUsers.length} runtime users)` : ''}`
	);

	// PowerSync (offline-sync.md, infrastructure.md §4): a read-only replication
	// role, a publication of exactly the tables the sync rules read, and a
	// separate database for PowerSync's own bucket storage. PowerSync signs in
	// with a password (it can't use IAM tokens): dev defaults locally, Secret
	// Manager values in production, re-applied on every run so rotation works.
	const tables = syncedTables();
	const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;
	const replPw = process.env.PS_REPLICATION_PASSWORD || (cloud ? null : 'powersync-dev');
	const storePw = process.env.PS_STORAGE_PASSWORD || (cloud ? null : 'powersync-dev');
	if (!replPw || !storePw)
		throw new Error('PS_REPLICATION_PASSWORD and PS_STORAGE_PASSWORD are required on Cloud SQL');
	await pool.query(`
		DO $$ BEGIN
			CREATE ROLE powersync_replication WITH REPLICATION BYPASSRLS LOGIN PASSWORD ${lit(replPw)};
		EXCEPTION WHEN duplicate_object THEN NULL; END $$;
		DO $$ BEGIN
			CREATE ROLE powersync_storage WITH LOGIN PASSWORD ${lit(storePw)};
		EXCEPTION WHEN duplicate_object THEN NULL; END $$;
		${cloud ? `ALTER ROLE powersync_replication PASSWORD ${lit(replPw)}; ALTER ROLE powersync_storage PASSWORD ${lit(storePw)};` : ''}
		REVOKE ALL ON ALL TABLES IN SCHEMA public FROM powersync_replication;
		GRANT USAGE ON SCHEMA public TO powersync_replication;
		GRANT SELECT ON ${tables.map((t) => `public.${t}`).join(', ')} TO powersync_replication;
	`);
	const list = tables.map((t) => `public.${t}`).join(', ');
	const { rowCount: hasPub } = await pool.query(
		"SELECT 1 FROM pg_publication WHERE pubname = 'powersync'"
	);
	await pool.query(
		hasPub
			? `ALTER PUBLICATION powersync SET TABLE ${list}`
			: `CREATE PUBLICATION powersync FOR TABLE ${list}`
	);
	const { rowCount: hasStore } = await pool.query(
		"SELECT 1 FROM pg_database WHERE datname = 'powersync_storage'"
	);
	if (!hasStore) {
		// Cloud SQL's admin isn't a superuser, so it must be a member to give the database away.
		await pool.query('GRANT powersync_storage TO CURRENT_USER');
		await pool.query('CREATE DATABASE powersync_storage OWNER powersync_storage');
	}
	console.log(`powersync: role, publication (${tables.length} tables) and storage database ready`);
} catch (err) {
	await pool.query('ROLLBACK').catch(() => {});
	console.error(err.message);
	process.exitCode = 1;
} finally {
	await pool.end();
}
