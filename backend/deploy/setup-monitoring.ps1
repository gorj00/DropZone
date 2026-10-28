$ErrorActionPreference = 'Continue'

$Project = 'gorol-saas-projects'
$Host_ = 'dropzone-api-258611697847.europe-west4.run.app'
$Email = 'os.jangorol@gmail.com'

$channel = gcloud beta monitoring channels list --project $Project --filter "labels.email_address=$Email" --format 'value(name)' | Select-Object -First 1
if (-not $channel) {
    $channel = gcloud beta monitoring channels create --project $Project --display-name "DropZone alerts" --type email --channel-labels "email_address=$Email" --format 'value(name)'
}

$check = gcloud monitoring uptime list-configs --project $Project --filter 'displayName="DropZone prod health"' --format 'value(name)' | Select-Object -First 1
if (-not $check) {
    gcloud monitoring uptime create 'DropZone prod health' --project $Project --resource-type uptime-url --resource-labels "host=$Host_,project_id=$Project" --path /actuator/health --protocol https --period 5 --timeout 10
}

$policy = @"
{
  "displayName": "DropZone prod down",
  "combiner": "OR",
  "conditions": [{
    "displayName": "Health check failing",
    "conditionThreshold": {
      "filter": "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND resource.label.host=\"$Host_\"",
      "aggregations": [{ "alignmentPeriod": "300s", "perSeriesAligner": "ALIGN_FRACTION_TRUE", "crossSeriesReducer": "REDUCE_MEAN" }],
      "comparison": "COMPARISON_LT",
      "thresholdValue": 0.5,
      "duration": "300s"
    }
  }, {
    "displayName": "Server errors",
    "conditionThreshold": {
      "filter": "metric.type=\"run.googleapis.com/request_count\" AND resource.type=\"cloud_run_revision\" AND resource.label.service_name=\"dropzone-api\" AND metric.label.response_code_class=\"5xx\"",
      "aggregations": [{ "alignmentPeriod": "300s", "perSeriesAligner": "ALIGN_SUM", "crossSeriesReducer": "REDUCE_SUM" }],
      "comparison": "COMPARISON_GT",
      "thresholdValue": 10,
      "duration": "0s"
    }
  }],
  "notificationChannels": ["$channel"]
}
"@
$existing = gcloud alpha monitoring policies list --project $Project --filter 'displayName="DropZone prod down"' --format 'value(name)' | Select-Object -First 1
if (-not $existing) {
    $file = New-TemporaryFile
    [IO.File]::WriteAllText($file.FullName, $policy)
    gcloud alpha monitoring policies create --project $Project --policy-from-file $file.FullName
    Remove-Item $file.FullName
}

Write-Host 'Monitoring: uptime check every 5 min, alert e-mail on downtime or more than 10 server errors in 5 min.'
