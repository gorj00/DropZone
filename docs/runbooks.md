# DropZone runbooks

Commands are for the dev environment (`gorol-saas-projects`, region `europe-west4`, Cloud Run `dropzone-api-dev`, Cloud SQL instance `saas-db`, database `dropzone_dev`, bucket `dropzone-dev-uploads`, secrets `dev-dropzone-*`). For production use the prod names once they exist. Run `gcloud` from PowerShell. Redeploy with `backend/deploy/deploy-dev.ps1`.

## 1. Erasure request (user cannot delete the account in the app)

1. Accept the request only from the account's own e-mail address (reply to it and wait for confirmation).
2. Find the account (connect with Cloud SQL Studio or `gcloud sql connect saas-db --user=dropzone_dev --database=dropzone_dev`):
   ```sql
   select id, email, created_at from users where email = lower('person@example.com');
   ```
3. Delete the uploads:
   ```powershell
   gcloud storage rm --recursive "gs://dropzone-dev-uploads/uploads/<USER_ID>/"
   ```
4. Delete the RevenueCat customer (skip if RevenueCat is not set up):
   ```powershell
   curl.exe -X DELETE "https://api.revenuecat.com/v1/subscribers/<USER_ID>" -H "Authorization: Bearer <REVENUECAT_API_KEY>"
   ```
5. Delete the row. Every other table cascades (goals, proofs, posts, comments, likes, hypes, friends, notifications, reports they filed, blocks, slip-ups):
   ```sql
   delete from users where id = '<USER_ID>';
   delete from reports r where r.target_type = 'POST' and not exists (select 1 from feed_items f where f.id = r.target_id);
   delete from reports r where r.target_type = 'COMMENT' and not exists (select 1 from comments c where c.id = r.target_id);
   ```
6. Reply to the user: the account is deleted; a Google Play subscription must be cancelled in Google Play (deleting the account does not stop billing); copies in database backups disappear when those backups expire.
7. Write down the date and the user id (not the e-mail) in the owner's request log.

The in-app path (`DELETE /api/v1/me`) does steps 3 to 5 automatically.

## 2. Database restore

Never restore a backup onto `saas-db` itself: that overwrites every database on the instance, including the other apps.

1. Check that backups exist:
   ```powershell
   gcloud sql backups list --instance saas-db --project gorol-saas-projects
   ```
2. Restore into a new temporary instance (choose a backup id from step 1):
   ```powershell
   gcloud sql instances create dropzone-restore --project gorol-saas-projects --region europe-west4 --database-version POSTGRES_16 --tier db-f1-micro
   gcloud sql backups restore <BACKUP_ID> --restore-instance dropzone-restore --backup-instance saas-db --project gorol-saas-projects
   ```
3. Export only the DropZone database and import it next to the live one:
   ```powershell
   gcloud sql export sql dropzone-restore gs://dropzone-dev-uploads/restore/dropzone_dev.sql --database dropzone_dev --project gorol-saas-projects
   gcloud sql databases create dropzone_dev_restored --instance saas-db --project gorol-saas-projects
   gcloud sql import sql saas-db gs://dropzone-dev-uploads/restore/dropzone_dev.sql --database dropzone_dev_restored --user dropzone_dev --project gorol-saas-projects
   ```
   Give the instance service accounts access to the bucket path if the export or import is refused.
4. Check the data in `dropzone_dev_restored` (row counts of `users`, `goals`, `proofs`).
5. Switch the API: change the database name in `DB_URL` in `backend/deploy/dev.env.yaml` to `dropzone_dev_restored` and run the deploy script.
6. When the app works, delete the temporary instance and the export file; keep the old database for a week, then drop it:
   ```powershell
   gcloud sql instances delete dropzone-restore --project gorol-saas-projects
   gcloud storage rm gs://dropzone-dev-uploads/restore/dropzone_dev.sql
   ```

## 3. Rotate JWT_SECRET (signs everybody out)

1. Create a new secret version (at least 32 bytes):
   ```powershell
   $file = Join-Path $env:TEMP 'jwt.txt'
   $bytes = New-Object byte[] 48; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
   [IO.File]::WriteAllText($file, [Convert]::ToBase64String($bytes))
   gcloud secrets versions add dev-dropzone-jwt-secret --data-file $file --project gorol-saas-projects
   Remove-Item $file
   ```
2. Run the deploy script (it reads the `latest` version). Every old token now gets 401 and the app shows the sign-in screen.
3. Disable the old version: `gcloud secrets versions disable <OLD_VERSION> --secret dev-dropzone-jwt-secret --project gorol-saas-projects`.

To sign out one user only, do not rotate; bump their token version instead:
```sql
update users set token_version = token_version + 1 where id = '<USER_ID>';
```

## 4. Revoke admin access

Admin = a Google-linked account whose e-mail is in `ADMIN_EMAILS`.

1. Remove the e-mail from `ADMIN_EMAILS` in `backend/deploy/dev.env.yaml` and run the deploy script. The check runs on every request, so access ends with the new revision.
2. Sign the person out everywhere:
   ```sql
   update users set token_version = token_version + 1 where email = lower('admin@example.com');
   ```
3. Do not clear `google_sub` on that row: a row without a Google subject can be claimed by any Google account with the same e-mail.

## 5. Rotate the RevenueCat webhook secret

1. Create a new secret version:
   ```powershell
   $file = Join-Path $env:TEMP 'webhook.txt'
   $bytes = New-Object byte[] 32; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
   [IO.File]::WriteAllText($file, [Convert]::ToBase64String($bytes))
   gcloud secrets versions add dev-dropzone-revenuecat-webhook-secret --data-file $file --project gorol-saas-projects
   Get-Content $file
   Remove-Item $file
   ```
2. Run the deploy script.
3. Right away, in the RevenueCat dashboard (Project settings > Integrations > Webhooks) set the Authorization header to `Bearer <new secret>`. Events sent between steps 2 and 3 get 401; RevenueCat retries them, and users can also refresh their status from the app (`POST /billing/refresh`).
4. Send a test event from the dashboard and check that it returns 200, then look for 401 responses on `/api/v1/webhooks/revenuecat` in the Cloud Run logs.
5. Disable the old secret version.

## Production setup and deploys

- First time: run `backend/deploy/setup-prod.ps1` (PowerShell, signed in to gcloud as a project owner). It creates the `dropzone_prod` database and user on the shared `saas-db`, the prod secrets, the private bucket `dropzone-prod-uploads` (no soft delete), the runtime service account and its roles, deploys the Cloud Run service `dropzone-api` (public, scales to zero), creates the seven Cloud Scheduler jobs and the uptime check with an alert e-mail. It is safe to run again.
- Later deploys: `backend/deploy/deploy-prod.ps1`. Dev deploys: `backend/deploy/deploy-dev.ps1`.
- From GitHub (after `backend/deploy/setup-github-deploy.ps1` ran once; no keys stored in GitHub): a push to `main` runs backend tests, web tests and build, and the Android build, then deploys dev. Prod deploys only from the `deploy-prod` workflow ("Run workflow", branch `main`). Both deploy a new image only; env and secrets changes still go through the PowerShell scripts.
- Prod API: `https://api.dropzone.mobi` (Cloud Run domain mapping created by `setup-prod.ps1`; needs `gcloud components install beta` and dropzone.mobi verified in Google Search Console). The run.app address `https://dropzone-api-258611697847.europe-west4.run.app` keeps working and is used by Cloud Scheduler.
- Website `https://dropzone.mobi` (landing page, `/privacy/`, `/terms/`, `/delete-account/`, `/invite/*` and `/p/*` pages, `/.well-known/assetlinks.json`): files in `website/`, deployed by `website/deploy.ps1` to the public bucket `dropzone.mobi` behind Cloudflare (proxied CNAME to `c.storage.googleapis.com`). Pages marked `data-draft` (the legal pages until the generator texts are pasted in) are skipped. After the first Play upload, add Play's app signing SHA-256 to `assetlinks.json`.
- Private photos on dev: run `backend/deploy/dev-private-photos.ps1` once (grants the dev runtime account the right to sign links, then removes public read and soft delete from `dropzone-dev-uploads`).
- Point-in-time recovery on `saas-db` is off: turning it on restarts the instance (lindasheet and owino too): `gcloud sql instances patch saas-db --project gorol-saas-projects --enable-point-in-time-recovery`.
