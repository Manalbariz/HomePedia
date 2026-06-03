# Genere les GeoJSON IGN depuis les Parquet (sans relancer DVF/INSEE).
# Apres un run national (HOMEPEDIA_SKIP_GEO=1), lancer avant le dashboard.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "HOMEPEDIA - generation carto IGN (geo-only)..." -ForegroundColor Cyan
python -m pipelines.ingest.run --config config/settings.yaml --geo-only
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "OK. Relance le dashboard Streamlit." -ForegroundColor Green
