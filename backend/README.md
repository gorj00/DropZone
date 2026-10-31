# DropZone API

Spring Boot 4.1 (Java 21, Gradle) backend for DropZone. Implements the contract in [`../docs/api.md`](../docs/api.md).

## Stack

- Spring Boot 4.1.2: Web MVC, Data JPA, Security (OAuth2 resource server with HS256 app JWTs), Validation, Actuator
- PostgreSQL 17 with Flyway migrations: `V1__schema.sql` (schema) and `V2__seed.sql` (quest catalog, slip-up types)
- Google sign-in: ID tokens are verified with `GoogleIdTokenVerifier`, then the backend issues its own 7-day JWT (renewed by `GET /me`, revoked by sign-out-everywhere or account deletion)
- Google Cloud Storage for uploads (fake-gcs-server locally)
- Firebase Cloud Messaging (firebase-admin, messaging only) for push
- RevenueCat for billing: a webhook, plus a REST refresh that reads entitlement `pro`

## Run locally

Everything in Docker (from the repo root):

```bash
docker compose up -d --build
```

Or run only the infrastructure in Docker and the API from Gradle:

```bash
docker compose up -d postgres gcs
JWT_SECRET=local-dev-secret-change-me-0123456789abcdef DEV_LOGIN=true REVENUECAT_WEBHOOK_SECRET=dev-webhook-secret ./gradlew bootRun
```

The API runs at `http://localhost:8080/api/v1` and health is at `http://localhost:8080/actuator/health`. Local defaults in `application.yml` match the compose services. `JWT_SECRET` has no default (the app does not start without it), `DEV_LOGIN` is off unless set, and webhooks get 401 until `REVENUECAT_WEBHOOK_SECRET` is set; `docker-compose.yml` sets all three for local use.

If host ports are taken, override them with `POSTGRES_PORT`, `GCS_PORT` and `API_PORT`. For example, when port 5432 is already in use:

```bash
POSTGRES_PORT=5433 docker compose up -d postgres gcs
DB_URL=jdbc:postgresql://localhost:5433/dropzone ./gradlew bootRun
```

Get a token without Google:

```bash
curl -s -X POST localhost:8080/api/v1/auth/dev -H 'Content-Type: application/json' -d '{"email":"me@test.dev","displayName":"Me"}'
```

To make a local user PRO, either send a RevenueCat-style webhook with `Authorization: Bearer dev-webhook-secret`, or run `update users set pro = true` in Postgres.

Uploaded files are served by fake-gcs-server at `http://localhost:4443/dropzone-local/<object>`. When testing on a real phone or an emulator, start the `gcs` service with `-public-host <your-LAN-IP>:4443` and set `GCS_PUBLIC_BASE_URL` to match, so the device can load the images.

## Tests

```bash
./gradlew build
```

Docker must be running: integration tests start `postgres:16` (same major version as the shared saas-db) with Testcontainers. There are unit tests for the rules (streak, unlock, checkpoint spacing, leaderboard, stats levels) and MockMvc integration tests for:

- the onboarding → today → quest flow
- PRO gating (402)
- community verification
- friends
- RevenueCat webhooks

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `DB_URL` / `DB_USER` / `DB_PASSWORD` | `jdbc:postgresql://localhost:5432/dropzone` / `dropzone` / `dropzone` | Postgres |
| `JWT_SECRET` | none (required) | HS256 key, at least 32 bytes |
| `GOOGLE_CLIENT_IDS` | empty | Comma-separated web + Android client IDs (token audiences). Google login returns 401 until this is set |
| `DEV_LOGIN` | `false` | Enables `POST /auth/dev` (local only; the prod profile refuses it) |
| `GCS_BUCKET` | `dropzone-local` | Upload bucket |
| `GCS_ENDPOINT` | `http://localhost:4443` | Emulator endpoint (photo links stay plain). Leave empty for real GCS (Application Default Credentials): the bucket is private and every photo link in a response is a V4 signed URL, signed through the IAM Credentials API, so the runtime service account needs `roles/iam.serviceAccountTokenCreator` on itself |
| `GCS_PUBLIC_BASE_URL` | `http://localhost:4443/dropzone-local` | Prefix of stored photo URLs; on real GCS it must be `https://storage.googleapis.com/<bucket>` (the prod profile checks it) |
| `GCS_CREATE_BUCKET` | `true` | Create the bucket on first upload if it's missing |
| `GCS_PROJECT_ID` | `dropzone-local` | GCP project |
| `FIREBASE_CREDENTIALS` | empty | Path to the service-account JSON for FCM, or `adc`. When empty, only the push type and user id are logged |
| `REVENUECAT_WEBHOOK_SECRET` | none | Expected `Authorization: Bearer …` on `/webhooks/revenuecat` (401 while unset) |
| `REVENUECAT_API_KEY` | empty | Secret REST key used by `POST /billing/refresh`. When empty, refresh returns the stored state |
| `CORS_ORIGINS` | `http://localhost:4200,capacitor://localhost,https://localhost,http://localhost` | Allowed origins |
| `DB_POOL_SIZE` | `5` | Hikari maximum pool size per instance |
| `TERMS_VERSION` / `PRIVACY_VERSION` | `1` | Current legal versions; users with other stored versions get `consentRequired` |
| `TERMS_URL` / `PRIVACY_URL` / `DELETE_ACCOUNT_URL` | empty | Links returned by `GET /config` |
| `MIN_VERSION_CODE` | `1` | Oldest Android build allowed by `GET /config` |
| `JOBS_IN_PROCESS` | `true` | Run the scheduled jobs inside the app (`@Scheduled`). Cloud Run sets `false` and lets Cloud Scheduler call `POST /internal/jobs/{name}` |
| `JOBS_AUDIENCE` | empty | Audience of the scheduler's Google OIDC token (for example `https://<service-url>/internal/jobs`). Job endpoints answer 403 while empty; required in prod |
| `JOBS_INVOKER` | empty | E-mail of the Cloud Scheduler service account allowed to run jobs. Required in prod |
| `IMAGE_CHECK` | `true` | Cloud Vision SafeSearch on photos that become public (REST with Application Default Credentials; the Vision API must be enabled). A failed call publishes the photo and logs a warning |
| `MIN_REPORTER_AGE` | `3d` | Reports from younger accounts don't count toward auto-hide (also the one-report nudity hide) |
| `PORT` | `8080` | HTTP port |

Production runs with `SPRING_PROFILES_ACTIVE=prod` (`application-prod.yml`): JSON logs for Cloud Logging, CORS `https://localhost` only, no storage defaults, and a startup check that refuses dev values and missing job settings (see `docs/api.md`).

Cloud Scheduler: one HTTP job per name, `POST https://<service-url>/internal/jobs/<name>`, OIDC token from the scheduler service account with the audience above, time zone `Etc/UTC`. Hourly: `daily-reminders`, `trial-reminders`, `deadline-reminders` (`0 * * * *`). Daily: `billing-reconcile`, `upload-sweep`, `inactive-accounts`, `notification-retention` (for example `30 3 * * *`). All jobs are idempotent, so retries and overlaps are safe. Dev deploys use `deploy/deploy-dev.ps1`; operational steps are in `../docs/runbooks.md`.

## Behaviour notes

- Gating is server-side. Free users get `402 PRO_REQUIRED` for:
  - non-free quests, or more than 3 quests
  - locking apps other than Instagram
  - MINUTES unlock
  - public checkpoints and COMMUNITY verification
  - custom quests
  - social, feed, leaderboard, stats and logging slip-ups

  Losing PRO keeps existing data, but MINUTES unlock falls back to WHOLE_DAY.
- `daily_results` stores done/total per user and day. It drives the streak, the stats heat map and `friendsCleared`.
- The streak counts back from today if today is complete, otherwise from yesterday. With the user setting `skipRestDays`, days with nothing scheduled are skipped instead of breaking it.
- Rate limits live in `config/RateLimitFilter.BUDGETS` (in-memory token buckets per instance, by user id, by client IP for sign-in).
- Community proofs need 3 verifies. A user can't verify their own proof and can verify each proof only once.
- Who can verify depends on visibility:
  - a public proof can be verified by any PRO user
  - a squad-only proof can be verified by friends only
- Checkpoint proofs inherit the checkpoint's `isPublic`. Squad-check quest proofs use the user's `publicByDefault`.
- Leaderboard periods are calendar based in the user's zone: the week runs Monday–Sunday, `HALF_YEAR` is Jan–Jun or Jul–Dec. Results come from recorded measurements:
  - onboarding start value
  - weigh-ins
  - checkpoint proofs
- Scheduled jobs (`jobs/Jobs`): daily, trial and deadline reminders every hour; billing reconciliation, upload sweep, inactive-account deletion (24 months, warning 30 days ahead) and notification retention (180 days) once a day. Each logs one `job=<name> …` line.
