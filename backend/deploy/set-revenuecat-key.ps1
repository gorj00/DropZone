param([ValidateSet('dev', 'prod')] [string] $Env = 'dev')
$ErrorActionPreference = 'Continue'

$Project = 'gorol-saas-projects'
$Region = 'europe-west4'
$Secret = "$Env-dropzone-revenuecat-api-key"
$Service = if ($Env -eq 'dev') { 'dropzone-api-dev' } else { 'dropzone-api' }
$Runtime = "$Env-dropzone-runtime@$Project.iam.gserviceaccount.com"

$secure = Read-Host 'RevenueCat secret API key (V1, starts with sk_)' -AsSecureString
$key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)).Trim()
if ($key.Length -eq 0) { throw 'Nothing was pasted. In this terminal paste with right-click (or Ctrl+Shift+V), then press Enter.' }
if (-not $key.StartsWith('sk_')) { throw "The key should start with sk_, but it starts with '$($key.Substring(0, [Math]::Min(3, $key.Length)))' and has $($key.Length) characters. Copy the secret key (not the public test_ key)." }

$file = New-TemporaryFile
[IO.File]::WriteAllText($file.FullName, $key)
gcloud secrets describe $Secret --project $Project *> $null
if ($LASTEXITCODE -eq 0) {
    gcloud secrets versions add $Secret --project $Project --data-file $file.FullName
}
else {
    gcloud secrets create $Secret --project $Project --replication-policy automatic --labels "app=dropzone,env=$Env" --data-file $file.FullName
}
Remove-Item $file.FullName

gcloud secrets add-iam-policy-binding $Secret --project $Project --member "serviceAccount:$Runtime" --role roles/secretmanager.secretAccessor --format none
gcloud run services update $Service --project $Project --region $Region --update-secrets "REVENUECAT_API_KEY=${Secret}:latest" --quiet

Write-Host "RevenueCat key is set on $Service."
