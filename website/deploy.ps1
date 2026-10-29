$ErrorActionPreference = 'Continue'

$Project = 'gorol-saas-projects'
$Region = 'europe-west4'
$Bucket = 'dropzone.mobi'
$Deployer = "github-deployer@$Project.iam.gserviceaccount.com"
$Site = $PSScriptRoot

$types = @{ '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.mp4' = 'video/mp4' }
$cache = @{ '.html' = 'no-cache'; '.json' = 'public, max-age=300'; '.css' = 'public, max-age=3600'; '.png' = 'public, max-age=86400'; '.jpg' = 'public, max-age=86400'; '.mp4' = 'public, max-age=604800' }

gcloud storage buckets describe "gs://$Bucket" --project $Project *> $null
if ($LASTEXITCODE -ne 0) {
    gcloud storage buckets create "gs://$Bucket" --project $Project --location $Region --uniform-bucket-level-access
    if ($LASTEXITCODE -ne 0) { throw "Creating gs://$Bucket failed. Verify dropzone.mobi in Google Search Console with this Google account first." }
    gcloud storage buckets add-iam-policy-binding "gs://$Bucket" --member allUsers --role roles/storage.objectViewer --format none
    gcloud storage buckets add-iam-policy-binding "gs://$Bucket" --member "serviceAccount:$Deployer" --role roles/storage.objectAdmin --format none
}
gcloud storage buckets update "gs://$Bucket" --web-main-page-suffix index.html --web-error-page 404.html

Get-ChildItem $Site -Recurse -File -Force | Where-Object { $types.ContainsKey($_.Extension) } | ForEach-Object {
    $path = $_.FullName.Substring($Site.Length + 1).Replace('\', '/')
    if ($_.Extension -eq '.html' -and (Select-String -Path $_.FullName -Pattern 'data-draft' -Quiet)) {
        Write-Host "skipped draft $path"
        return
    }
    gcloud storage cp $_.FullName "gs://$Bucket/$path" --content-type $types[$_.Extension] --cache-control $cache[$_.Extension] --quiet
}

Write-Host "Website deployed to https://$Bucket"
