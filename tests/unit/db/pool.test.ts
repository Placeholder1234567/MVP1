import { afterEach, describe, expect, it, vi } from 'vitest';
import { iamDbUser, poolConfig } from '../../../src/lib/server/db/pool';

afterEach(() => vi.unstubAllEnvs());

describe('database connection settings', () => {
	it('uses DATABASE_URL locally', () => {
		vi.stubEnv('CLOUD_SQL_INSTANCE', '');
		vi.stubEnv('DATABASE_URL', 'postgres://guad:guad@localhost:5433/guad');
		expect(poolConfig()).toEqual({
			connectionString: 'postgres://guad:guad@localhost:5433/guad',
			max: 10
		});
	});

	it('uses the Cloud SQL socket and an IAM token on Cloud Run', () => {
		vi.stubEnv('CLOUD_SQL_INSTANCE', 'demo:us-central1:guad-pg');
		vi.stubEnv('DB_USER', 'guad-web@demo.iam.gserviceaccount.com');
		vi.stubEnv('DB_PASSWORD', '');
		const c = poolConfig();
		expect(c).toMatchObject({
			host: '/cloudsql/demo:us-central1:guad-pg',
			database: 'guad',
			user: 'guad-web@demo.iam'
		});
		// A token callback, never a stored password.
		expect(typeof c.password).toBe('function');
	});

	it('lets the migration job sign in as the admin user', () => {
		vi.stubEnv('CLOUD_SQL_INSTANCE', 'demo:us-central1:guad-pg');
		vi.stubEnv('DB_USER', 'postgres');
		vi.stubEnv('DB_PASSWORD', 'from-secret-manager');
		expect(poolConfig(2)).toMatchObject({
			user: 'postgres',
			password: 'from-secret-manager',
			max: 2
		});
	});

	it('maps service accounts to IAM database users', () => {
		expect(iamDbUser('guad-worker@demo.iam.gserviceaccount.com')).toBe('guad-worker@demo.iam');
	});
});
