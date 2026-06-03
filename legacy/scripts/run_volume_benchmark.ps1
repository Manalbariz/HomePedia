param(
  [ValidateSet("report", "baseline", "medium", "high", "all_cities", "compare")]
  [string]$Mode = "baseline",
  [switch]$WithSpark,
  [switch]$WithGeo
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

switch ($Mode) {
  "report" {
    python scripts/benchmark_volume.py report --scenario baseline
  }
  "compare" {
    $spark = ""
    if ($WithSpark) { $spark = "--run-spark" }
    $geo = ""
    if ($WithGeo) { $geo = "--with-geo" } else { $geo = "--skip-geo" }
    python scripts/benchmark_volume.py compare --scenarios baseline,medium,high $spark $geo
  }
  default {
    $spark = ""
    if ($WithSpark) { $spark = "--run-spark" }
    $geo = ""
    if ($WithGeo) { $geo = "--with-geo" }
    python scripts/benchmark_volume.py run --scenario $Mode $spark $geo
  }
}

Write-Host ""
Write-Host "Rapports dans reports/volumetry/"
