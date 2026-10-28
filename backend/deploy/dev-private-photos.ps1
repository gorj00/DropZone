$ErrorActionPreference = 'Continue'

$Project = 'gorol-saas-projects'
$Bucket = 'dropzone-dev-uploads'
$Runtime = "dev-dropzone-runtime@$Project.iam.gserviceaccount.com"

gcloud iam service-accounts add-iam-policy-binding $Runtime --project $Project --member "serviceAccount:$Runtime" --role roles/iam.serviceAccountTokenCreator --format none
gcloud projects add-iam-policy-binding $Project --member "serviceAccount:$Runtime" --role roles/serviceusage.serviceUsageConsumer --format none

Write-Host 'Waiting 90 s for the IAM change to reach the server...'
Start-Sleep -Seconds 90

gcloud storage buckets remove-iam-policy-binding "gs://$Bucket" --member allUsers --role roles/storage.objectViewer --format none
gcloud storage buckets update "gs://$Bucket" --clear-soft-delete

Write-Host 'Dev photos are private now; the API hands out signed links.'
