import { defineConfig } from 'drizzle-kit';

// .specify/schema.ts stays the single source of truth for the schema;
// src/lib/server/db/schema.ts re-exports it for app code.
export default defineConfig({
	dialect: 'postgresql',
	schema: './.specify/schema.ts',
	out: './drizzle',
	dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://guad:guad@localhost:5433/guad' }
});
