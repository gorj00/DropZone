$ErrorActionPreference = 'Continue'

$Project = 'gorol-saas-projects'
$Region = 'europe-west4'
$Service = 'dropzone-api-dev'
$Image = 'europe-west4-docker.pkg.dev/gorol-saas-projects/apps/dropzone-api:dev'
$Backend = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $PSScriptRoot 'dev.env.yaml'
$Secrets = @(
    'DB_PASSWORD=dev-dropzone-db-password:latest',
    'JWT_SECRET=dev-dropzone-jwt-secret:latest',
    'REVENUECAT_WEBHOOK_SECRET=dev-dropzone-revenuecat-webhook-secret:latest',
    'UNSPLASH_ACCESS_KEY=dev-dropzone-unsplash-access-key:latest'
) -join ','

if (-not (Test-Path $EnvFile)) {
    throw "Missing $EnvFile"
}

docker build -t $Image $Backend
if ($LASTEXITCODE -ne 0) { throw 'docker build failed' }

docker push $Image
if ($LASTEXITCODE -ne 0) { throw 'docker push failed' }

gcloud run deploy $Service `
    --project $Project `
    --region $Region `
    --image $Image `
    --env-vars-file $EnvFile `
    --set-secrets $Secrets `
    --quiet
if ($LASTEXITCODE -ne 0) { throw 'gcloud run deploy failed' }
