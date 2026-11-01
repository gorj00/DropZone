$ErrorActionPreference = 'Stop'

$Project = 'gorol-saas-projects'
$Bucket = 'dropzone.mobi'
$Frontend = $PSScriptRoot
$Out = Join-Path $Frontend 'dist\admin\browser'

Push-Location $Frontend
try {
    npm run build:admin
    if ($LASTEXITCODE -ne 0) { throw 'ng build admin failed' }
}
finally {
    Pop-Location
}

$files = Get-ChildItem $Out -Recurse -File
foreach ($file in $files) {
    $path = $file.FullName.Substring($Out.Length + 1).Replace('\', '/')
    $hashed = $path -match '-[A-Z0-9]{8}\.(js|css)$'
    $cache = if ($hashed) { 'public, max-age=31536000, immutable' } else { 'no-cache' }
    gcloud storage cp $file.FullName "gs://$Bucket/admin/$path" --project $Project --cache-control $cache --quiet
    if ($LASTEXITCODE -ne 0) { throw "upload of $path failed" }
}

Write-Host "Backoffice deployed to https://$Bucket/admin/ ($($files.Count) files)"
