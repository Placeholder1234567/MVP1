#!/usr/bin/env bash
# Builds the image and deploys every Guad workload (deploy/README.md, step 4):
# migrate job -> powersync -> worker -> web -> Cloud Tasks queues + Cloud Scheduler.
# Re-run for each release; every step is idempotent.
#   PROJECT=my-project FIREBASE_API_KEY=... bash deploy/deploy.sh
# Optional: deploy/app.env.yaml adds or overrides app settings (see app.env.example.yaml).
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/config.sh
gcloud config set project "$PROJECT" >/dev/null

FIREBASE_API_KEY="${FIREBASE_API_KEY:?set FIREBASE_API_KEY (Firebase web config, a public identifier)}"
FIREBASE_AUTH_DOMAIN="${FIREBASE_AUTH_DOMAIN:-${PROJECT}.firebaseapp.com}"
TAG="${TAG:-$(git rev-parse --short HEAD)}"
IMAGE="${IMAGE_BASE}:${TAG}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
for bucket in "$EXPORTS_BUCKET" "$MEDIA_BUCKET"; do
	if ! gcloud storage buckets describe "gs://$bucket" >/dev/null 2>&1; then
		echo "gs://$bucket doesn't exist: run deploy/bootstrap.sh first (it creates the storage buckets)" >&2
		exit 1
	fi
done

exists() { "$@" >/dev/null 2>&1; }
url_of() { gcloud run services describe "$1" --region="$REGION" --format='value(status.url)' 2>/dev/null || true; }
put_secret() { # put_secret <name> <file>: new version only when the content changed
	if ! exists gcloud secrets describe "$1"; then
		gcloud secrets create "$1" --data-file="$2" --replication-policy=automatic
	elif ! cmp -s "$2" <(gcloud secrets versions access latest --secret="$1"); then
		gcloud secrets versions add "$1" --data-file="$2"
	fi
}
access() { gcloud secrets add-iam-policy-binding "$1" --member="serviceAccount:$2" --role=roles/secretmanager.secretAccessor >/dev/null; }

if [[ -n "$(git status --porcelain)" ]]; then echo "warning: uncommitted changes are included in $TAG" >&2; fi

# The prerendered /offline page's CSP is fixed at build time, so PowerSync's
# public URL must be known before the build (docs/offline-csp.md). Cloud Run's
# deterministic URL is predictable before the service exists; set POWERSYNC_URL
# to use another one (a custom domain). APP_ORIGIN sets the canonical origin.
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
POWERSYNC_URL="${POWERSYNC_URL:-https://guad-powersync-${PROJECT_NUMBER}.${REGION}.run.app}"
APP_ORIGIN="${APP_ORIGIN:-}"

echo "== Build $IMAGE"
cat >"$TMP/cloudbuild.yaml" <<YAML
steps:
  - name: gcr.io/cloud-builders/docker
    args:
      - build
      - --build-arg=PUBLIC_POWERSYNC_URL=$POWERSYNC_URL
      - --build-arg=APP_ORIGIN=$APP_ORIGIN
      - --tag=$IMAGE
      - .
images:
  - $IMAGE
YAML
gcloud builds submit --config="$TMP/cloudbuild.yaml" .

echo "== PowerSync config and Cloud SQL details"
SQL_IP="$(gcloud sql instances describe "$SQL_INSTANCE" --format='value(ipAddresses[0].ipAddress)')"
gcloud sql instances describe "$SQL_INSTANCE" --format='value(serverCaCert.cert)' >"$TMP/ca.pem"
node scripts/sync-rules.mjs --check
put_secret powersync-config deploy/powersync.yaml
put_secret powersync-sync-config powersync/sync-config.yaml
put_secret sql-server-ca "$TMP/ca.pem"
for s in powersync-config powersync-sync-config sql-server-ca; do access "$s" "$SA_POWERSYNC"; done

echo "== Migrations (Cloud Run job guad-migrate)"
gcloud run jobs deploy guad-migrate --image="$IMAGE" --region="$REGION" \
	--service-account="$SA_MIGRATE" --set-cloudsql-instances="$CLOUD_SQL_CONN" "${VPC_FLAGS[@]}" \
	--command=node --args=scripts/db-setup.mjs --max-retries=0 --task-timeout=10m \
	--set-env-vars="CLOUD_SQL_INSTANCE=$CLOUD_SQL_CONN,DB_USER=postgres,DB_RUNTIME_USERS=$SA_WEB;$SA_WORKER" \
	--set-secrets="DB_PASSWORD=db-admin-password:latest,PS_REPLICATION_PASSWORD=ps-replication-password:latest,PS_STORAGE_PASSWORD=ps-storage-password:latest"
gcloud run jobs execute guad-migrate --region="$REGION" --wait

echo "== PowerSync (min 1 instance)"
gcloud run deploy guad-powersync --image="$POWERSYNC_IMAGE" --region="$REGION" \
	--service-account="$SA_POWERSYNC" "${VPC_FLAGS[@]}" --allow-unauthenticated \
	--args=start,-r,unified --port=8080 --min-instances=1 --max-instances=2 \
	--cpu=1 --memory=1Gi --no-cpu-throttling --timeout=3600 \
	--set-env-vars="POWERSYNC_CONFIG_PATH=/config/service.yaml,PS_PG_HOST=$SQL_IP,GOOGLE_CLOUD_PROJECT=$PROJECT,NODE_OPTIONS=--max-old-space-size=800" \
	--set-secrets="/config/service.yaml=powersync-config:latest,/sync/sync-config.yaml=powersync-sync-config:latest,PS_PG_CA=sql-server-ca:latest,PS_REPLICATION_PASSWORD=ps-replication-password:latest,PS_STORAGE_PASSWORD=ps-storage-password:latest"

# App settings shared by web and worker. Cloud Run's own URLs are known once
# each service exists; the first deploy fills them in on a second pass.
WORKER_URL="$(url_of guad-worker)"
WEB_URL="$(url_of guad-web)"
app_defaults() { # app_defaults <service> <service account>
	cat <<EOF
GUAD_SERVICE: "$1"
NODE_ENV: "production"
GOOGLE_CLOUD_PROJECT: "$PROJECT"
GOOGLE_CLOUD_REGION: "$REGION"
CLOUD_SQL_INSTANCE: "$CLOUD_SQL_CONN"
DB_USER: "$2"
JOBS_DRIVER: "cloud-tasks"
TASKS_QUEUE_PREFIX: "$TASKS_QUEUE_PREFIX"
WORKER_URL: "$WORKER_URL"
WORKER_SERVICE_ACCOUNT: "$SA_TASKS"
APP_URL: "$WEB_URL"
EXPORTS_BUCKET: "$EXPORTS_BUCKET"
MEDIA_BUCKET: "$MEDIA_BUCKET"
PUBLIC_FIREBASE_API_KEY: "$FIREBASE_API_KEY"
PUBLIC_FIREBASE_AUTH_DOMAIN: "$FIREBASE_AUTH_DOMAIN"
PUBLIC_FIREBASE_PROJECT_ID: "$PROJECT"
PUBLIC_POWERSYNC_URL: "$POWERSYNC_URL"
PROTOCOL_HEADER: "x-forwarded-proto"
HOST_HEADER: "host"
ADDRESS_HEADER: "x-forwarded-for"
# The client is the last X-Forwarded-For entry on a run.app URL. Behind an
# external Application Load Balancer it is the second to last (the balancer
# appends its own address), so set XFF_DEPTH: "2" in deploy/app.env.yaml.
XFF_DEPTH: "1"
# Board photos are uploaded through tRPC (up to 1.5 MB, about 2 MB as base64);
# adapter-node's default request limit is 512K.
BODY_SIZE_LIMIT: "4M"
EOF
}
# deploy/app.env.yaml settings replace the defaults (deploy/app-env.awk).
app_env() { # app_env <service> <service account> > env file
	if [[ -f deploy/app.env.yaml ]]; then
		app_defaults "$@" | awk -f deploy/app-env.awk deploy/app.env.yaml -
	else
		app_defaults "$@"
	fi
}

deploy_app() { # deploy_app <service> <GUAD_SERVICE> <service account> [extra flags]
	app_env "$2" "$3" >"$TMP/$1.env.yaml"
	gcloud run deploy "$1" --image="$IMAGE" --region="$REGION" --service-account="$3" \
		--set-cloudsql-instances="$CLOUD_SQL_CONN" "${VPC_FLAGS[@]}" \
		--env-vars-file="$TMP/$1.env.yaml" --set-secrets="DEVICE_KEY_KEK=device-key-kek:latest" \
		--cpu=1 --memory=512Mi --min-instances=0 "${@:4}"
}

echo "== Worker"
# Private by default: only guad-tasks may invoke it. Set PUBLIC_WEBHOOKS=1 once
# AWS SNS webhooks are configured, since SNS can't send a Google token; the app
# then serves only job routes (Google OIDC checked in code) and webhook routes
# (SNS signature checked in code) on this service (hooks.server.ts).
WORKER_AUTH=--no-allow-unauthenticated
if [[ "${PUBLIC_WEBHOOKS:-0}" == 1 ]]; then WORKER_AUTH=--allow-unauthenticated; fi
deploy_app guad-worker worker "$SA_WORKER" "$WORKER_AUTH" --max-instances=5 --timeout=600
gcloud run services add-iam-policy-binding guad-worker --region="$REGION" \
	--member="serviceAccount:$SA_TASKS" --role=roles/run.invoker >/dev/null

echo "== Web"
deploy_app guad-web web "$SA_WEB" --allow-unauthenticated --max-instances=10

if [[ -z "$WORKER_URL" || -z "$WEB_URL" ]]; then
	echo "== First deploy: filling in service URLs"
	WORKER_URL="$(url_of guad-worker)"
	WEB_URL="$(url_of guad-web)"
	deploy_app guad-worker worker "$SA_WORKER" "$WORKER_AUTH" --max-instances=5 --timeout=600
	deploy_app guad-web web "$SA_WEB" --allow-unauthenticated --max-instances=10
fi

echo "== Cloud Tasks queues and Cloud Scheduler jobs (from src/lib/server/jobs/registry.ts)"
npx tsx scripts/cloud-jobs.ts >"$TMP/jobs.txt"
grep '^queue ' "$TMP/jobs.txt" | while read -r _ name concurrency per_second attempts; do
	q="${TASKS_QUEUE_PREFIX}${name}"
	flags=(--location="$REGION" --max-concurrent-dispatches="$concurrency"
		--max-dispatches-per-second="$per_second" --max-attempts="$attempts"
		--min-backoff=10s --max-backoff=300s)
	if exists gcloud tasks queues describe "$q" --location="$REGION"; then
		gcloud tasks queues update "$q" "${flags[@]}" >/dev/null
	else
		gcloud tasks queues create "$q" "${flags[@]}"
	fi
done
# "cron <job> <m h dom mon dow>": the rest of the line is the schedule.
grep '^cron ' "$TMP/jobs.txt" | while read -r _ job schedule; do
	j="${TASKS_QUEUE_PREFIX}guad-${job}"
	flags=(--location="$REGION" --schedule="$schedule" --time-zone=UTC
		--uri="$WORKER_URL/api/jobs/$job" --http-method=POST --message-body='{}'
		--oidc-service-account-email="$SA_TASKS" --oidc-token-audience="$WORKER_URL")
	if exists gcloud scheduler jobs describe "$j" --location="$REGION"; then
		gcloud scheduler jobs update http "$j" "${flags[@]}" --update-headers=Content-Type=application/json >/dev/null
	else
		gcloud scheduler jobs create http "$j" "${flags[@]}" --headers=Content-Type=application/json
	fi
done

cat <<EOF

Deployed $TAG
  web        $WEB_URL
  worker     $WORKER_URL
  powersync  $POWERSYNC_URL
Add the web URL's host to Identity Platform's authorized domains if it isn't there yet.
EOF
