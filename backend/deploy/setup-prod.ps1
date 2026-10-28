$ErrorActionPreference = 'Continue'

$Project = 'gorol-saas-projects'
$Region = 'europe-west4'
$Instance = 'saas-db'
$Bucket = 'dropzone-prod-uploads'
$Runtime = "prod-dropzone-runtime@$Project.iam.gserviceaccount.com"
$Scheduler = "dropzone-scheduler@$Project.iam.gserviceaccount.com"
$JobsUrl = "https://dropzone-api-258611697847.europe-west4.run.app/internal/jobs"

function RandomHex([int] $bytes) {
    $b = New-Object byte[] $bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    ($b | ForEach-Object { $_.ToString('x2') }) -join ''
}

function Exists([scriptblock] $check) {
    & $check *> $null
    $LASTEXITCODE -eq 0
}

function NewSecret([string] $name, [string] $value) {
    if (Exists { gcloud secrets describe $name --project $Project }) { Write-Host "secret $name exists"; return }
    $file = New-TemporaryFile
    [IO.File]::WriteAllText($file.FullName, $value)
    gcloud secrets create $name --project $Project --replication-policy automatic --data-file $file.FullName
    Remove-Item $file.FullName
}

function SecretAccess([string] $name) {
    gcloud secrets add-iam-policy-binding $name --project $Project --member "serviceAccount:$Runtime" --role roles/secretmanager.secretAccessor --format none
}

if (-not (Exists { gcloud iam service-accounts describe $Runtime --project $Project })) {
    gcloud iam service-accounts create prod-dropzone-runtime --project $Project --display-name "DropZone prod runtime"
}

if (-not (Exists { gcloud sql databases describe dropzone_prod --instance $Instance --project $Project })) {
    gcloud sql databases create dropzone_prod --instance $Instance --project $Project
}
if (-not (Exists { gcloud secrets describe prod-dropzone-db-password --project $Project })) {
    $password = RandomHex 24
    gcloud sql users create dropzone_prod --instance $Instance --project $Project --password $password
    NewSecret 'prod-dropzone-db-password' $password
}
NewSecret 'prod-dropzone-jwt-secret' (RandomHex 48)
NewSecret 'prod-dropzone-revenuecat-webhook-secret' (RandomHex 32)
NewSecret 'prod-dropzone-unsplash-access-key' (gcloud secrets versions access latest --secret dev-dropzone-unsplash-access-key --project $Project)

if (-not (Exists { gcloud storage buckets describe "gs://$Bucket" --project $Project })) {
    gcloud storage buckets create "gs://$Bucket" --project $Project --location $Region --uniform-bucket-level-access --public-access-prevention --soft-delete-duration 0
}

gcloud projects add-iam-policy-binding $Project --member "serviceAccount:$Runtime" --role roles/cloudsql.client --format none
gcloud projects add-iam-policy-binding $Project --member "serviceAccount:$Runtime" --role roles/firebasecloudmessaging.admin --format none
gcloud projects add-iam-policy-binding $Project --member "serviceAccount:$Runtime" --role roles/serviceusage.serviceUsageConsumer --format none
'prod-dropzone-db-password', 'prod-dropzone-jwt-secret', 'prod-dropzone-revenuecat-webhook-secret', 'prod-dropzone-unsplash-access-key' | ForEach-Object { SecretAccess $_ }
gcloud storage buckets add-iam-policy-binding "gs://$Bucket" --member "serviceAccount:$Runtime" --role roles/storage.objectAdmin --format none
gcloud iam service-accounts add-iam-policy-binding $Runtime --project $Project --member "serviceAccount:$Runtime" --role roles/iam.serviceAccountTokenCreator --format none

& (Join-Path $PSScriptRoot 'deploy-prod.ps1')

$Deployer = "github-deployer@$Project.iam.gserviceaccount.com"
if (Exists { gcloud iam service-accounts describe $Deployer --project $Project }) {
    gcloud run services add-iam-policy-binding dropzone-api --region $Region --project $Project --member "serviceAccount:$Deployer" --role roles/run.developer --format none
    gcloud iam service-accounts add-iam-policy-binding $Runtime --project $Project --member "serviceAccount:$Deployer" --role roles/iam.serviceAccountUser --format none
}

$jobs = [ordered]@{
    'daily-reminders'        = '0 * * * *'
    'trial-reminders'        = '0 * * * *'
    'deadline-reminders'     = '0 * * * *'
    'billing-reconcile'      = '30 3 * * *'
    'upload-sweep'           = '40 3 * * *'
    'inactive-accounts'      = '50 3 * * *'
    'notification-retention' = '10 4 * * *'
}
foreach ($name in $jobs.Keys) {
    if (Exists { gcloud scheduler jobs describe "dropzone-prod-$name" --project $Project --location $Region }) { continue }
    gcloud scheduler jobs create http "dropzone-prod-$name" --project $Project --location $Region --schedule $jobs[$name] --time-zone 'Etc/UTC' `
        --uri "$JobsUrl/$name" --http-method POST --oidc-service-account-email $Scheduler --oidc-token-audience $JobsUrl --attempt-deadline 300s --quiet
}

& (Join-Path $PSScriptRoot 'setup-monitoring.ps1')

Write-Host 'Production is set up: https://dropzone-api-258611697847.europe-west4.run.app'
