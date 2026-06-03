# NLP Inside Airbnb — telechargement + traitement streaming
param(
    [string]$ConfigPath = "config\settings.yaml",
    [ValidateSet("light", "transformers")]
    [string]$Mode = "light",
    [switch]$DownloadOnly,
    [switch]$SkipDownload,
    [string]$City = ""
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

$env:MONGO_HOST = "localhost"
$env:MONGO_PORT = "27017"

$argsList = @("-m", "pipelines.nlp.run", "--config", $ConfigPath, "--mode", $Mode)
if ($DownloadOnly) { $argsList += "--download-only" }
if ($SkipDownload) { $argsList += "--skip-download" }
if ($City) { $argsList += @("--city", $City) }

Write-Host "NLP mode=$Mode" -ForegroundColor Cyan
python @argsList
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "NLP OK." -ForegroundColor Green
