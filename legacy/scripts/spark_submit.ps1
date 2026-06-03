# Lance le job Spark aggregate dans le conteneur spark-master (PowerShell-safe, pas de &&).
param(
    [string]$ConfigPath = "config/settings.yaml"
)

$ErrorActionPreference = "Stop"

$cfgInContainer = "/opt/hompeedia/" + ($ConfigPath -replace "\\", "/")
# Guillemets simples pour que PowerShell ne parse pas ; ni &&
$shellCmd = "python3 -m pip install -q pyyaml; /spark/bin/spark-submit --packages org.postgresql:postgresql:42.7.3 /opt/hompeedia/pipelines/spark/jobs/aggregate.py --config $cfgInContainer"

Write-Host "Spark submit: $cfgInContainer"
docker compose exec -T spark-master sh -lc $shellCmd
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
