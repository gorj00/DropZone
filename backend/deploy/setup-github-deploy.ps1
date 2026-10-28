$ErrorActionPreference = 'Continue'

$Project = 'gorol-saas-projects'
$ProjectNumber = '258611697847'
$Region = 'europe-west4'
$Repo = 'gorj00/DropZone'
$Deployer = "github-deployer@$Project.iam.gserviceaccount.com"
$DevRuntime = "dev-dropzone-runtime@$Project.iam.gserviceaccount.com"
$ProdRuntime = "prod-dropzone-runtime@$Project.iam.gserviceaccount.com"

function Exists([scriptblock] $check) {
    & $check *> $null
    $LASTEXITCODE -eq 0
}

function AllowDeploy([string] $service, [string] $runtime) {
    gcloud run services add-iam-policy-binding $service --region $Region --project $Project --member "serviceAccount:$Deployer" --role roles/run.developer --format none
    gcloud iam service-accounts add-iam-policy-binding $runtime --project $Project --member "serviceAccount:$Deployer" --role roles/iam.serviceAccountUser --format none
}

gcloud services enable sts.googleapis.com iamcredentials.googleapis.com --project $Project

if (-not (Exists { gcloud iam workload-identity-pools describe github --location global --project $Project })) {
    gcloud iam workload-identity-pools create github --location global --project $Project --display-name 'GitHub Actions'
}
if (-not (Exists { gcloud iam workload-identity-pools providers describe dropzone --workload-identity-pool github --location global --project $Project })) {
    gcloud iam workload-identity-pools providers create-oidc dropzone --workload-identity-pool github --location global --project $Project `
        --display-name 'DropZone main branch' --issuer-uri 'https://token.actions.githubusercontent.com' `
        --attribute-mapping 'google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref' `
        --attribute-condition "assertion.repository == '$Repo' && assertion.ref == 'refs/heads/main'"
}

if (-not (Exists { gcloud iam service-accounts describe $Deployer --project $Project })) {
    gcloud iam service-accounts create github-deployer --project $Project --display-name 'DropZone GitHub deploys'
}
gcloud iam service-accounts add-iam-policy-binding $Deployer --project $Project --role roles/iam.workloadIdentityUser `
    --member "principalSet://iam.googleapis.com/projects/$ProjectNumber/locations/global/workloadIdentityPools/github/attribute.repository/$Repo" --format none
gcloud artifacts repositories add-iam-policy-binding apps --location $Region --project $Project --member "serviceAccount:$Deployer" --role roles/artifactregistry.writer --format none

AllowDeploy 'dropzone-api-dev' $DevRuntime
if (Exists { gcloud run services describe dropzone-api --region $Region --project $Project }) {
    AllowDeploy 'dropzone-api' $ProdRuntime
}

Write-Host "GitHub can deploy now: pushes to main deploy dev, the deploy-prod workflow deploys prod."
