#!/usr/bin/env bash
# One-time setup of a Google Cloud project for Guad (deploy/README.md, step 2).
# Safe to re-run: every step skips what already exists.
#   PROJECT=my-project bash deploy/bootstrap.sh
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/config.sh

gcloud config set project "$PROJECT" >/dev/null
exists() { "$@" >/dev/null 2>&1; }
secret() { # secret <name> <value-command>: create once with a generated value
	exists gcloud secrets describe "$1" || { "${@:2}" | gcloud secrets create "$1" --data-file=- --replication-policy=automatic; }
}
random_b64url() { openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n'; }
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "== APIs"
gcloud services enable run.googleapis.com sqladmin.googleapis.com cloudtasks.googleapis.com \
	cloudscheduler.googleapis.com secretmanager.googleapis.com artifactregistry.googleapis.com \
	cloudbuild.googleapis.com iam.googleapis.com iamcredentials.googleapis.com \
	servicenetworking.googleapis.com compute.googleapis.com identitytoolkit.googleapis.com \
	aiplatform.googleapis.com speech.googleapis.com fcm.googleapis.com storage.googleapis.com

echo "== Artifact Registry"
exists gcloud artifacts repositories describe "$REPO" --location="$REGION" ||
	gcloud artifacts repositories create "$REPO" --repository-format=docker --location="$REGION"

echo "== Service accounts"
for sa in guad-web guad-worker guad-tasks guad-migrate guad-powersync; do
	exists gcloud iam service-accounts describe "${sa}@${PROJECT}.iam.gserviceaccount.com" ||
		gcloud iam service-accounts create "$sa" --display-name="Guad ${sa#guad-}"
done
role() { gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$1" --role="$2" --condition=None >/dev/null; }
for sa in "$SA_WEB" "$SA_WORKER"; do
	role "$sa" roles/cloudsql.client
	role "$sa" roles/cloudsql.instanceUser   # IAM database sign-in
	role "$sa" roles/cloudtasks.enqueuer
	role "$sa" roles/firebaseauth.admin       # session cookies, revocation
	role "$sa" roles/aiplatform.user          # Lomi (Claude on Vertex AI)
	role "$sa" roles/speech.client            # transcription
	# Creating a task with an OIDC token for guad-tasks needs actAs on it.
	gcloud iam service-accounts add-iam-policy-binding "$SA_TASKS" \
		--member="serviceAccount:$sa" --role=roles/iam.serviceAccountUser >/dev/null
done
role "$SA_WORKER" roles/firebasecloudmessaging.admin
role "$SA_MIGRATE" roles/cloudsql.client
# The web service signs Firebase custom tokens for PowerSync through the IAM API (infrastructure.md §3).
gcloud iam service-accounts add-iam-policy-binding "$SA_WEB" \
	--member="serviceAccount:$SA_WEB" --role=roles/iam.serviceAccountTokenCreator >/dev/null

echo "== Report files bucket (gs://$EXPORTS_BUCKET)"
# The worker writes report files and the web service serves them, so they
# can't live on either container's disk. Files are deleted by the app when
# they expire (24 hours, or 7 days for scheduled reports); the lifecycle rule
# is a backstop a day after the longest of those.
exists gcloud storage buckets describe "gs://$EXPORTS_BUCKET" ||
	gcloud storage buckets create "gs://$EXPORTS_BUCKET" --location="$REGION" \
		--uniform-bucket-level-access --public-access-prevention
echo '{"rule":[{"action":{"type":"Delete"},"condition":{"age":8}}]}' >"$TMP/exports-lifecycle.json"
gcloud storage buckets update "gs://$EXPORTS_BUCKET" --lifecycle-file="$TMP/exports-lifecycle.json" >/dev/null
for sa in "$SA_WEB" "$SA_WORKER"; do
	gcloud storage buckets add-iam-policy-binding "gs://$EXPORTS_BUCKET" \
		--member="serviceAccount:$sa" --role=roles/storage.objectAdmin >/dev/null
done

echo "== Private services access (Cloud SQL private IP)"
exists gcloud compute addresses describe google-managed-services-"$NETWORK" --global ||
	gcloud compute addresses create google-managed-services-"$NETWORK" --global \
		--purpose=VPC_PEERING --prefix-length=16 --network="$NETWORK"
gcloud services vpc-peerings connect --service=servicenetworking.googleapis.com \
	--ranges=google-managed-services-"$NETWORK" --network="$NETWORK" 2>/dev/null || true
# Direct VPC egress needs Private Google Access to keep reaching Google APIs.
gcloud compute networks subnets update "$SUBNET" --region="$REGION" --enable-private-ip-google-access

echo "== Secrets"
secret db-admin-password random_b64url
secret ps-replication-password random_b64url
secret ps-storage-password random_b64url
secret device-key-kek random_b64url

echo "== Cloud SQL (takes ~10 minutes the first time)"
if ! exists gcloud sql instances describe "$SQL_INSTANCE"; then
	gcloud sql instances create "$SQL_INSTANCE" --database-version=POSTGRES_16 \
		--edition=ENTERPRISE --tier="$SQL_TIER" --region="$REGION" --availability-type=zonal \
		--network="projects/$PROJECT/global/networks/$NETWORK" --no-assign-ip \
		--ssl-mode=ENCRYPTED_ONLY --storage-size=10 --storage-auto-increase \
		--backup-start-time=08:00 --enable-point-in-time-recovery --deletion-protection \
		--database-flags=cloudsql.iam_authentication=on,cloudsql.logical_decoding=on
fi
exists gcloud sql databases describe guad --instance="$SQL_INSTANCE" ||
	gcloud sql databases create guad --instance="$SQL_INSTANCE"
gcloud sql users set-password postgres --instance="$SQL_INSTANCE" \
	--password="$(gcloud secrets versions access latest --secret=db-admin-password)"
for sa in "$SA_WEB" "$SA_WORKER"; do
	exists gcloud sql users describe "${sa%.gserviceaccount.com}" --instance="$SQL_INSTANCE" ||
		gcloud sql users create "${sa%.gserviceaccount.com}" --instance="$SQL_INSTANCE" --type=cloud_iam_service_account
done

echo "== Secret access"
access() { gcloud secrets add-iam-policy-binding "$1" --member="serviceAccount:$2" --role=roles/secretmanager.secretAccessor >/dev/null; }
access db-admin-password "$SA_MIGRATE"
for s in ps-replication-password ps-storage-password; do access "$s" "$SA_MIGRATE"; access "$s" "$SA_POWERSYNC"; done
access device-key-kek "$SA_WEB"
access device-key-kek "$SA_WORKER"

cat <<EOF

Bootstrap done. Before the first deploy (deploy/README.md):
  - Identity Platform: enable it in the console and turn on Email/Password.
  - Budget alerts in Billing.
  - For messaging: the AWS side (step 5) and PUSH/EMAIL/SMS driver settings.
Then: PROJECT=$PROJECT bash deploy/deploy.sh
EOF
