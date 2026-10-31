$ErrorActionPreference = 'Continue'

$Project = 'gorol-saas-projects'
$Region = 'europe-west4'
$Service = 'dropzone-api'
$Image = 'europe-west4-docker.pkg.dev/gorol-saas-projects/apps/dropzone-api:prod'
$Runtime = "prod-dropzone-runtime@$Project.iam.gserviceaccount.com"
$Backend = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $PSScriptRoot 'prod.env.yaml'
$Secrets = @(
    'DB_PASSWORD=prod-dropzone-db-password:latest',
    'JWT_SECRET=prod-dropzone-jwt-secret:latest',
    'REVENUECAT_WEBHOOK_SECRET=prod-dropzone-revenuecat-webhook-secret:latest',
    'UNSPLASH_ACCESS_KEY=prod-dropzone-unsplash-access-key:latest',
    'STATUS_TOKEN=prod-dropzone-status-token:latest'
) -join ','
gcloud secrets describe prod-dropzone-revenuecat-api-key --project $Project *> $null
if ($LASTEXITCODE -eq 0) { $Secrets += ',REVENUECAT_API_KEY=prod-dropzone-revenuecat-api-key:latest' }

$Sha = git -C $Backend rev-parse --short HEAD
if (git -C $Backend status --porcelain) { $Sha += '-dirty' }
docker build --build-arg "GIT_SHA=$Sha" -t $Image $Backend
if ($LASTEXITCODE -ne 0) { throw 'docker build failed' }

docker push $Image
if ($LASTEXITCODE -ne 0) { throw 'docker push failed' }

gcloud run deploy $Service `
    --project $Project `
    --region $Region `
    --image $Image `
    --service-account $Runtime `
    --add-cloudsql-instances "${Project}:${Region}:saas-db" `
    --env-vars-file $EnvFile `
    --set-secrets $Secrets `
    --min-instances 1 `
    --max-instances 2 `
    --concurrency 40 `
    --memory 1Gi `
    --cpu-boost `
    --allow-unauthenticated `
    --quiet
if ($LASTEXITCODE -ne 0) { throw 'gcloud run deploy failed' }
