// Postgres connection settings (infrastructure.md §2). Shared by the app and
// scripts/db-setup.mjs, so it uses only erasable TypeScript (Node runs it
// directly) and reads process.env.
//
//   Local dev:  DATABASE_URL=postgres://...
//   Cloud Run:  CLOUD_SQL_INSTANCE=project:region:instance, connected through
//               the service's Cloud SQL socket (/cloudsql/<instance>). The app
//               signs in as its service account's IAM database user, with a
//               short-lived OAuth token as the password, so no database
//               password is stored. DB_PASSWORD is only for the migration job,
//               which runs as the built-in admin user (deploy/README.md).
import type { PoolConfig } from 'pg';
import { GoogleAuth } from 'google-auth-library';

let auth: GoogleAuth | undefined;

async function iamToken(): Promise<string> {
	auth ??= new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/sqlservice.login'] });
	const token = await auth.getAccessToken();
	if (!token) throw new Error('No access token for Cloud SQL IAM sign-in');
	return token;
}

/** The IAM database user for a service account: its email without ".gserviceaccount.com". */
export function iamDbUser(serviceAccount: string): string {
	return serviceAccount.replace(/\.gserviceaccount\.com$/, '');
}

export function poolConfig(max = 10): PoolConfig {
	const instance = process.env.CLOUD_SQL_INSTANCE;
	if (!instance) {
		const url = process.env.DATABASE_URL;
		if (!url) throw new Error('DATABASE_URL is not set');
		return { connectionString: url, max };
	}
	const user = process.env.DB_USER;
	if (!user) throw new Error('DB_USER is not set');
	return {
		host: `/cloudsql/${instance}`,
		database: process.env.DB_NAME ?? 'guad',
		user: user.includes('@') ? iamDbUser(user) : user,
		password: process.env.DB_PASSWORD || iamToken,
		max
	};
}
