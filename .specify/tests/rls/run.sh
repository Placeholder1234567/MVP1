#!/usr/bin/env bash
# Applies schema.ts + rls.sql to a throwaway Postgres 15 and runs the RLS and
# integrity-trigger tests. Requires Docker and Node.
#   bash .specify/tests/rls/run.sh
set -euo pipefail
export MSYS_NO_PATHCONV=1
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
trap 'docker stop guad-rls-test >/dev/null 2>&1 || true; rm -rf "$work"' EXIT

cd "$work"
npm init -y >/dev/null
npm i --silent drizzle-orm@0.36.4 drizzle-kit@0.28.1
cp "$here/../../schema.ts" .
npx drizzle-kit generate --dialect postgresql --schema ./schema.ts --out ./out >/dev/null
sed 's/--> statement-breakpoint//' out/*.sql > 01_schema.sql
cp "$here/../../rls.sql" 015_rls.sql
cp "$here"/0*.sql .

docker run -d --rm --name guad-rls-test -e POSTGRES_PASSWORD=test postgres:15-alpine >/dev/null
# The image runs a temporary server for first-time setup, then restarts it, and
# pg_isready can say "ready" during that window. Wait for setup to finish first.
until docker logs guad-rls-test 2>&1 | grep -q "PostgreSQL init process complete"; do sleep 1; done
until docker exec guad-rls-test pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done

for f in 01_schema.sql 015_rls.sql 02_grants_seed.sql 03_tests.sql; do
  docker cp "$f" guad-rls-test:/tmp/"$f"
done
for f in 01_schema.sql 015_rls.sql 02_grants_seed.sql; do
  docker exec guad-rls-test psql -U postgres -q -v ON_ERROR_STOP=1 -f /tmp/"$f"
done

out="$(docker exec guad-rls-test psql -U postgres -q -f /tmp/03_tests.sql 2>&1 | grep -E 'PASS|FAIL' | sed 's/^.*NOTICE:  //')"
echo "$out"
if grep -q '^FAIL' <<<"$out"; then exit 1; fi
