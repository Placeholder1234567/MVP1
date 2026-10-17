# SQL patches

`rls.sql` is applied once per database (`scripts/db-setup.mjs`), so once a
database exists, changes to its policies, triggers and functions ship here
instead: one file per change, named `NNNN_snake_case.sql`. `db-setup` applies
each file once, in order, inside a transaction, and records it in
`app.sql_patches`. Fresh databases run `rls.sql` and then every patch.

Write patches so they apply cleanly on top of `rls.sql` plus the earlier
patches: `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS` before
`CREATE TRIGGER`, `DROP POLICY IF EXISTS` before `CREATE POLICY`. Table and
column changes stay in Drizzle migrations (`npm run db:generate`).
