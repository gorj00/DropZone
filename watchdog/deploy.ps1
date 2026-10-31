$ErrorActionPreference = 'Stop'

$Project = 'gorol-saas-projects'
$Toml = Join-Path $PSScriptRoot 'wrangler.toml'
Set-Location $PSScriptRoot

npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }

$config = Get-Content $Toml -Raw
if ($config -match 'REPLACE_WITH_KV_ID') {
    $out = npx wrangler kv namespace create dropzone-watchdog-state | Out-String
    if ($out -notmatch '"?id"?\s*[=:]\s*"([0-9a-f]{32})"') { throw "Could not read the KV namespace id:`n$out" }
    [IO.File]::WriteAllText($Toml, $config -replace 'REPLACE_WITH_KV_ID', $Matches[1])
}

npx wrangler deploy
if ($LASTEXITCODE -ne 0) { throw 'wrangler deploy failed' }

gcloud secrets versions access latest --secret prod-dropzone-status-token --project $Project | npx wrangler secret put STATUS_TOKEN
if ($LASTEXITCODE -ne 0) { throw 'setting STATUS_TOKEN failed' }

Write-Host 'Watchdog deployed: checks https://api.dropzone.mobi every 5 minutes and emails os.jangorol@gmail.com.'
