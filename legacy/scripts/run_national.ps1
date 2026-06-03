# Pipeline echelle nationale + Kafka (POC)
# Prerequis: docker compose up -d
# Geo IGN desactivee pendant le run (trop lourd en WFS).

param(
    [string]$ConfigPath = "config\settings.yaml",
    [switch]$SkipSpark,
    [switch]$SkipKafkaConsumer
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "=== HOMEPEDIA - run national ===" -ForegroundColor Cyan

$env:HOMEPEDIA_DVF_SAMPLE_CITIES = "0"
$env:HOMEPEDIA_SKIP_GEO = "1"
$env:HOMEPEDIA_KAFKA_ENABLED = "1"
$env:HOMEPEDIA_SPARK_WRITE_MODE = "overwrite"

Write-Host "[1/4] Infra docker compose..."
docker compose up -d
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[2/4] Ingestion nationale..."
$sw = [System.Diagnostics.Stopwatch]::StartNew()
python -m pipelines.ingest.run --config $ConfigPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$sw.Stop()
Write-Host ("Ingestion: {0:N1} s" -f $sw.Elapsed.TotalSeconds)

Write-Host "[3/4] Benchmark rapport national..."
python scripts/benchmark_volume.py run --scenario national --no-ingest --skip-raw-count
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not $SkipSpark) {
    Write-Host "[4/4] Spark aggregate overwrite Postgres..."
    $sw2 = [System.Diagnostics.Stopwatch]::StartNew()
    & "$PSScriptRoot\spark_submit.ps1" -ConfigPath $ConfigPath
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $sw2.Stop()
    Write-Host ("Spark: {0:N1} s" -f $sw2.Elapsed.TotalSeconds)
}
else {
    Write-Host "[4/4] Spark ignore -SkipSpark"
}

if (-not $SkipKafkaConsumer) {
    Write-Host "Consumer Kafka - 1 message..."
    $env:HOMEPEDIA_KAFKA_TRIGGER_SPARK = "0"
    python -m pipelines.messaging.consumer --config $ConfigPath --from-beginning --max-messages 1
}

Write-Host ""
Write-Host "Termine. Rapports: reports/volumetry/" -ForegroundColor Green
