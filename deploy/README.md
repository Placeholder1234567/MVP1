# Deploying Guad to Google Cloud

How to stand up the stack in infrastructure.md on a new Google Cloud project, then ship releases. **Synthetic data only** until every box in infrastructure.md §8 is ticked (BAAs, private IP, backups, audit logs).

## What gets created

| Workload                            | What                                                                                          | Reached by                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `guad-web` (Cloud Run)              | The app: pages, tRPC, `sync.upload`, `/auth/*`                                                | Public HTTPS                                            |
| `guad-worker` (Cloud Run)           | Same image, `GUAD_SERVICE=worker`: only `/api/jobs/*` and `/api/webhooks/*`                   | Cloud Tasks / Scheduler (OIDC as `guad-tasks`), AWS SNS |
| `guad-powersync` (Cloud Run, min 1) | PowerSync Open Edition 1.26.1                                                                 | Devices (Identity Platform ID tokens)                   |
| `guad-migrate` (Cloud Run job)      | `node scripts/db-setup.mjs`: migrations, `rls.sql`, grants, PowerSync role + publication      | Run by `deploy.sh` before each release                  |
| Cloud SQL `guad-pg`                 | Postgres 16, private IP only, IAM auth, logical decoding, backups + PITR, deletion protection | Cloud Run over Direct VPC egress                        |
| Cloud Tasks queues, Scheduler jobs  | Generated from `src/lib/server/jobs/registry.ts` (`scripts/cloud-jobs.ts`)                    |                                                         |

One image (`Dockerfile`) serves `web`, `worker` and `migrate`.

**Database sign-in.** `web` and `worker` sign in as their service accounts' IAM database users, with a short-lived OAuth token as the password (`src/lib/server/db/pool.ts`), then `SET LOCAL ROLE app_user` / `app_service` as usual. No app database password exists. Two exceptions use passwords from Secret Manager:

- `migrate` runs as the built-in `postgres` admin, because creating roles and the PowerSync database needs Cloud SQL's admin role.
- PowerSync signs in with passwords, because it can't use IAM tokens.

## 1. Before you start

- A Google Cloud project with billing, and `gcloud` signed in as an Owner. Run the scripts from Cloud Shell, or from a machine with `bash`, `openssl`, `git` and Node 22.18+ (for `npx tsx`).
- Budget alerts set in Billing (infrastructure.md §7).
- Optional: the Google for Startups / free-trial credits.

## 2. One-time project setup

```bash
PROJECT=my-project bash deploy/bootstrap.sh
```

This enables the APIs and creates the following, skipping anything that already exists:

- **Images:** the Artifact Registry repo.
- **Identities:** five service accounts, each with only the roles it needs.
- **Network:** private services access, so Cloud SQL gets a private IP.
- **Secrets:** generated values for the `postgres` admin, the two PowerSync roles, and `DEVICE_KEY_KEK`.
- **Database:** the Cloud SQL instance (about 10 minutes the first time), the `guad` database, and IAM database users for `web` and `worker`.

Then in the console:

1. **Identity Platform:** enable it, turn on Email/Password, and copy the web API key from _Application setup details_. That key is a public identifier, not a secret. Under _MFA_, turn on **TOTP** (authenticator apps) and leave SMS off. Admins must set up TOTP at their first sign-in, and supervisors within 30 days (security.md "MFA Policy"). Until TOTP is on, `MFA_ENFORCE=off` in `deploy/app.env.yaml` lets admins in without it; don't leave that set for real data. Also set the password policy to "enforce" (10+ characters, upper and lower case, a digit).
2. **Users:** create the first admin's sign-in account. There's no sign-up page, so each profile row is linked to its account by `auth_uid`.

## 3. First-deploy checks (not yet verified on a real project)

These are the parts that couldn't be tested without a Google Cloud project. Check each once:

- [ ] **`BYPASSRLS` on Cloud SQL.** `rls.sql` creates `app_service` with `BYPASSRLS`, and `db-setup` creates `powersync_replication` with `REPLICATION BYPASSRLS`. Cloud SQL's `postgres` user is not a true superuser, and Google's docs don't clearly say it may grant `BYPASSRLS`. If `guad-migrate` fails on this, raise it before working around it. The likely fix is making `app_service` the table owner instead, since owners skip RLS unless it's forced. That changes `rls.sql`.
- [ ] **PowerSync TLS.** PowerSync connects with `sslmode: verify-ca` and the instance's server CA (`deploy/powersync.yaml`). Check its logs show replication starting.
- [ ] **Sync token signing.** Sign in on the web URL and confirm `/auth/sync-token` works. That proves `guad-web` can sign custom tokens through the IAM API.

## 4. Deploy a release

```bash
PROJECT=my-project FIREBASE_API_KEY=<web api key> bash deploy/deploy.sh
```

It runs these steps in order:

1. **Build:** builds the image with Cloud Build, tagged with the git commit.
2. **PowerSync config:** checks `powersync/sync-config.yaml` matches the spec, then stores it and `deploy/powersync.yaml` as secrets.
3. **Migrate:** runs `guad-migrate` and waits for it.
4. **Services:** deploys `guad-powersync`, then `guad-worker` and `guad-web`. On the very first deploy, it does a second pass to fill in the services' own URLs.
5. **Jobs:** creates or updates the Cloud Tasks queues and Cloud Scheduler jobs.

Extra settings (Lomi models, messaging drivers, a custom domain) go in `deploy/app.env.yaml`; see `deploy/app.env.example.yaml`. Rollback: `gcloud run services update-traffic guad-web --to-revisions=<previous>=100` (and the same for `guad-worker`). Migrations only go forward, so a rollback has to work with the newer schema.

## 5. Messaging (when ready)

Push (FCM) needs nothing beyond `PUSH_DRIVER=fcm`. Email and SMS need an AWS account with the AWS BAA accepted:

1. **IAM role for the worker.** Create an IAM OIDC trust on `accounts.google.com` for the worker's identity: audience `sts.amazonaws.com`, subject = the numeric unique ID of `guad-worker@<project>.iam.gserviceaccount.com`. The role may only call `ses:SendEmail` and `sms-voice:SendTextMessage`. Its ARN is `AWS_ROLE_ARN`.
2. **SES.** Verify the sending domain (SPF, DKIM, DMARC; notifications.md §7). Add a configuration set whose event destination is an SNS topic for bounces and complaints.
3. **SMS.** Register for 10DLC (allow 1–3 weeks). Add a configuration set whose event destination is an SNS topic. Turn on two-way SMS for the number, publishing inbound messages to a second SNS topic (shift-offer replies, STOP/START).
4. **Webhook subscriptions.** Subscribe the three topics by HTTPS to `<worker URL>/api/webhooks/aws/ses-events`, `.../sms-events` and `.../sms-inbound`. The worker confirms the subscriptions itself.
5. **Settings.** Put the values in `deploy/app.env.yaml`, then deploy with `PUBLIC_WEBHOOKS=1`.

**Why `PUBLIC_WEBHOOKS`.** infrastructure.md §2 says the worker is not publicly invokable, and that's the default here: only `guad-tasks` may call it. AWS SNS can't attach a Google token, though, so the webhooks need the worker to accept unauthenticated requests at the Cloud Run level. The app then still serves only the job routes (Google OIDC token checked in code, `jobs/oidc.ts`) and the webhook routes (SNS signature checked in code). Everything else returns 404 (`hooks.server.ts`).

## Known gaps

- **Retry counts.** A queue's retry count is the highest `maxAttempts` among its jobs, because Cloud Tasks retries per queue. So a job meant to run once (e.g. `coverage-timeout` on `scheduling`) is retried if it throws; its handler still sees `final` on the first attempt.
- **Not covered.** Cloud Storage exports, MFA enforcement and Cloud Audit Logs aren't set up by these scripts yet.
