# Settings shared by bootstrap.sh and deploy.sh. Edit PROJECT (and REGION if
# needed), or set them in the environment before running the scripts.
PROJECT="${PROJECT:?set PROJECT to your Google Cloud project ID}"
REGION="${REGION:-us-central1}"

SQL_INSTANCE="${SQL_INSTANCE:-guad-pg}"
SQL_TIER="${SQL_TIER:-db-g1-small}"          # shared core, ~$25/month (infrastructure.md §7)
NETWORK="${NETWORK:-default}"
SUBNET="${SUBNET:-default}"
REPO="${REPO:-guad}"                          # Artifact Registry repository
TASKS_QUEUE_PREFIX="${TASKS_QUEUE_PREFIX:-}"  # e.g. "staging-" to share a project
# Private bucket for generated report files; web and worker both use it.
EXPORTS_BUCKET="${EXPORTS_BUCKET:-${PROJECT}-guad-exports}"

# Service accounts (one per workload, least privilege).
SA_WEB="guad-web@${PROJECT}.iam.gserviceaccount.com"
SA_WORKER="guad-worker@${PROJECT}.iam.gserviceaccount.com"
SA_TASKS="guad-tasks@${PROJECT}.iam.gserviceaccount.com"      # identity Cloud Tasks/Scheduler sign as
SA_MIGRATE="guad-migrate@${PROJECT}.iam.gserviceaccount.com"
SA_POWERSYNC="guad-powersync@${PROJECT}.iam.gserviceaccount.com"

CLOUD_SQL_CONN="${PROJECT}:${REGION}:${SQL_INSTANCE}"
IMAGE_BASE="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/app"
POWERSYNC_IMAGE="${POWERSYNC_IMAGE:-docker.io/journeyapps/powersync-service:1.26.1}"

# Direct VPC egress so Cloud Run reaches Cloud SQL's private IP (no connector, no NAT).
VPC_FLAGS=(--network="$NETWORK" --subnet="$SUBNET" --vpc-egress=private-ranges-only)
