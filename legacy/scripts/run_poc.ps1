param(
    [string]$ConfigPath = "config\settings.yaml",
    [int]$Port = 8501
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "Starting infra docker compose..."
docker compose up -d
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Running ingestion..."
python -m pipelines.ingest.run --config $ConfigPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Running spark aggregation..."
& "$PSScriptRoot\spark_submit.ps1" -ConfigPath $ConfigPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "NLP download (Inside Airbnb)..."
python -m pipelines.nlp.run --config $ConfigPath --download-only
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "NLP traitement streaming (light)..."
python -m pipelines.nlp.run --config $ConfigPath --skip-download --mode light
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Launching Streamlit..."
$env:POSTGRES_HOST = "localhost"
$env:POSTGRES_PORT = "5433"
python -m streamlit run dashboard\app.py --server.port $Port
