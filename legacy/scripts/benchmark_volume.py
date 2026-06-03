"""
Benchmark volumétrie HOMEPEDIA — mesure tailles, lignes et durées par scénario.

Exemples:
  python scripts/benchmark_volume.py report
  python scripts/benchmark_volume.py run --scenario baseline
  python scripts/benchmark_volume.py run --scenario high --run-spark
  python scripts/benchmark_volume.py compare --scenarios baseline,medium,high
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml

BASE_DIR = Path(__file__).resolve().parent.parent

DEFAULT_SCENARIOS: dict[str, dict[str, Any]] = {
    "baseline": {"label": "POC (50 communes)", "dvf_sample_cities": 50},
    "medium": {"label": "Charge modérée (500 communes)", "dvf_sample_cities": 500},
    "high": {"label": "Forte volumétrie (2000 communes)", "dvf_sample_cities": 2000},
    "all_cities": {
        "label": "Sans filtre commune (0 = toutes les communes du CSV)",
        "dvf_sample_cities": 0,
    },
}


@dataclass
class DatasetStats:
    path: str
    exists: bool = False
    size_bytes: int = 0
    size_human: str = ""
    parquet_files: int = 0
    rows: int | None = None
    city_rows: int | None = None
    unique_insee_codes: int | None = None


@dataclass
class ScenarioReport:
    scenario: str
    label: str
    dvf_sample_cities: int
    timings_sec: dict[str, float] = field(default_factory=dict)
    raw: dict[str, DatasetStats] = field(default_factory=dict)
    processed: dict[str, DatasetStats] = field(default_factory=dict)
    geo: dict[str, Any] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)


def _human_bytes(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    for unit in ("KiB", "MiB", "GiB"):
        n /= 1024
        if n < 1024:
            return f"{n:.2f} {unit}"
    return f"{n / 1024:.2f} TiB"


def _path_size(path: Path) -> int:
    if not path.exists():
        return 0
    if path.is_file():
        return path.stat().st_size
    total = 0
    for p in path.rglob("*"):
        if p.is_file():
            total += p.stat().st_size
    return total


def _count_files(path: Path, pattern: str) -> int:
    if not path.exists():
        return 0
    return sum(1 for _ in path.rglob(pattern))


def _load_config(config_path: Path) -> dict:
    with open(config_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def _load_scenarios(cfg: dict) -> dict[str, dict[str, Any]]:
    custom = (cfg.get("volumetry") or {}).get("scenarios") or {}
    merged = {**DEFAULT_SCENARIOS, **custom}
    return merged


def _count_parquet_rows(dataset_dir: Path) -> int | None:
    if not dataset_dir.exists():
        return None
    try:
        import pyarrow.dataset as ds

        dataset = ds.dataset(str(dataset_dir), format="parquet", partitioning="hive")
        return int(dataset.scanner().count_rows())
    except Exception:
        pass
    try:
        import pandas as pd

        total = 0
        for p in dataset_dir.rglob("*.parquet"):
            total += len(pd.read_parquet(p))
        return total if total else None
    except Exception:
        return None


def _parquet_city_stats(dataset_dir: Path) -> tuple[int | None, int | None]:
    """Retourne (lignes level=city, nb communes uniques) si colonnes présentes."""
    if not dataset_dir.exists():
        return None, None
    try:
        import pyarrow.dataset as ds

        dataset = ds.dataset(str(dataset_dir), format="parquet", partitioning="hive")
        table = dataset.scanner(columns=["level", "insee_code"]).to_table()
        import pyarrow.compute as pc

        levels = table.column("level").to_pylist()
        codes = table.column("insee_code").to_pylist()
        city_codes = {c for lv, c in zip(levels, codes) if lv == "city" and c is not None}
        city_rows = sum(1 for lv in levels if lv == "city")
        return city_rows, len(city_codes)
    except Exception:
        return None, None


def _stats_for_path(path: Path, *, count_rows: bool = True) -> DatasetStats:
    st = DatasetStats(path=path.as_posix(), exists=path.exists())
    if not st.exists:
        return st
    st.size_bytes = _path_size(path)
    st.size_human = _human_bytes(st.size_bytes)
    st.parquet_files = _count_files(path, "*.parquet")
    if count_rows and st.parquet_files:
        st.rows = _count_parquet_rows(path)
        city_rows, unique = _parquet_city_stats(path)
        st.city_rows = city_rows
        st.unique_insee_codes = unique
    return st


def _estimate_dvf_raw_cities(raw_csv: Path) -> int | None:
    if not raw_csv.exists() or os.getenv("HOMEPEDIA_SKIP_RAW_CITY_COUNT", "0").strip() == "1":
        return None
    try:
        import pandas as pd

        codes: set[str] = set()
        for chunk in pd.read_csv(
            raw_csv,
            sep=",",
            usecols=["echelle_geo", "code_geo"],
            chunksize=200_000,
            low_memory=False,
        ):
            if "echelle_geo" not in chunk.columns:
                return None
            city = chunk[chunk["echelle_geo"].astype(str).str.lower() == "commune"]
            if "code_geo" in city.columns:
                codes.update(city["code_geo"].dropna().astype(str).unique())
        return len(codes) if codes else None
    except Exception:
        return None


def collect_snapshot(cfg: dict, *, scenario: str, sample_cities: int, label: str) -> ScenarioReport:
    local = Path(cfg["paths"]["local_data_dir"])
    if not local.is_absolute():
        local = BASE_DIR / local

    report = ScenarioReport(
        scenario=scenario,
        label=label,
        dvf_sample_cities=sample_cities,
    )

    raw_dvf = local / "raw" / "dvf" / "dvf_stats_whole_period.csv"
    raw_insee = local / "raw" / "insee"
    proc_dvf = local / "processed" / "parquet" / "dvf_prices"
    proc_insee = local / "processed" / "parquet" / "insee_demographics"
    geo_dir = local / "processed" / "geo"

    report.raw["dvf_csv"] = _stats_for_path(raw_dvf, count_rows=False)
    report.raw["insee_dir"] = _stats_for_path(raw_insee, count_rows=False)

    report.processed["dvf_prices"] = _stats_for_path(proc_dvf)
    report.processed["insee_demographics"] = _stats_for_path(proc_insee)

    n_cities_raw = _estimate_dvf_raw_cities(raw_dvf)
    if n_cities_raw is not None:
        report.notes.append(f"Communes (echelle_geo=commune) dans le CSV DVF brut : ~{n_cities_raw}")

    for level in ("city", "department", "region"):
        gj = geo_dir / f"{level}.geojson"
        if gj.exists():
            report.geo[level] = {
                "path": gj.as_posix(),
                "size_bytes": gj.stat().st_size,
                "size_human": _human_bytes(gj.stat().st_size),
            }

    return report


def _run_ingest(env: dict, config_path: Path, *, skip_geo: bool) -> float:
    run_env = env.copy()
    if skip_geo:
        run_env["HOMEPEDIA_SKIP_GEO"] = "1"
    t0 = time.perf_counter()
    rc = subprocess.call(
        [sys.executable, "-m", "pipelines.ingest.run", "--config", str(config_path)],
        cwd=str(BASE_DIR),
        env=run_env,
    )
    elapsed = time.perf_counter() - t0
    if rc != 0:
        raise RuntimeError(f"Ingestion échouée (code {rc})")
    return elapsed


def _run_spark(env: dict, config_path: Path) -> float:
    # Chemin vu depuis le conteneur (WORKDIR = /opt/hompeedia), pas le path Windows hôte.
    try:
        config_in_container = config_path.relative_to(BASE_DIR).as_posix()
    except ValueError:
        config_in_container = "config/settings.yaml"

    t0 = time.perf_counter()
    cmd = [
        "docker",
        "compose",
        "exec",
        "-T",
        "spark-master",
        "sh",
        "-lc",
        "python3 -m pip install -q pyyaml && "
        "/spark/bin/spark-submit --packages org.postgresql:postgresql:42.7.3 "
        f"pipelines/spark/jobs/aggregate.py --config {config_in_container}",
    ]
    rc = subprocess.call(cmd, cwd=str(BASE_DIR), env=env)
    elapsed = time.perf_counter() - t0
    if rc != 0:
        raise RuntimeError(f"Spark aggregate échoué (code {rc}) — Docker démarré ?")
    return elapsed


def run_scenario(
    *,
    scenario: str,
    cfg: dict,
    config_path: Path,
    run_ingest: bool,
    run_spark: bool,
    skip_geo: bool,
) -> ScenarioReport:
    scenarios = _load_scenarios(cfg)
    if scenario not in scenarios:
        raise SystemExit(f"Scénario inconnu: {scenario}. Disponibles: {', '.join(scenarios)}")

    spec = scenarios[scenario]
    sample = int(spec.get("dvf_sample_cities", 50))
    label = str(spec.get("label", scenario))

    env = os.environ.copy()
    env["HOMEPEDIA_DVF_SAMPLE_CITIES"] = str(sample)
    env.setdefault("HOMEPEDIA_UPLOAD_HDFS", "0")

    report = ScenarioReport(scenario=scenario, label=label, dvf_sample_cities=sample)

    if run_ingest:
        print(f"[benchmark] Ingestion (HOMEPEDIA_DVF_SAMPLE_CITIES={sample}) …")
        try:
            report.timings_sec["ingest_total"] = _run_ingest(env, config_path, skip_geo=skip_geo)
        except RuntimeError as e:
            report.notes.append(str(e))
            return report
    else:
        report.notes.append("Ingestion non exécutée (--no-ingest).")

    snap = collect_snapshot(cfg, scenario=scenario, sample_cities=sample, label=label)
    report.raw = snap.raw
    report.processed = snap.processed
    report.geo = snap.geo
    report.notes.extend(snap.notes)

    if run_spark:
        print("[benchmark] Spark aggregate …")
        try:
            report.timings_sec["spark_aggregate"] = _run_spark(env, config_path)
        except RuntimeError as e:
            report.notes.append(str(e))

    return report


def _report_to_dict(report: ScenarioReport) -> dict:
    d = asdict(report)
    return d


def print_report(report: ScenarioReport) -> None:
    print()
    print("=" * 60)
    print(f"Scénario : {report.scenario} — {report.label}")
    print(f"Échantillon communes (DVF/INSEE) : {report.dvf_sample_cities}")
    print("=" * 60)

    if report.timings_sec:
        print("\nDurées (s):")
        for k, v in report.timings_sec.items():
            print(f"  {k}: {v:.2f}")

    print("\nDonnées brutes:")
    for name, st in report.raw.items():
        if isinstance(st, dict):
            st = DatasetStats(**st)
        print(f"  {name}: {st.size_human or '—'} ({st.path})")

    print("\nParquet traités:")
    for name, st in report.processed.items():
        if isinstance(st, dict):
            st = DatasetStats(**st)
        extra = []
        if st.rows is not None:
            extra.append(f"{st.rows} lignes")
        if st.unique_insee_codes is not None:
            extra.append(f"{st.unique_insee_codes} communes")
        suffix = f" — {', '.join(extra)}" if extra else ""
        print(f"  {name}: {st.size_human or '—'}{suffix}")

    if report.geo:
        print("\nGeoJSON:")
        for level, info in report.geo.items():
            print(f"  {level}: {info.get('size_human', '?')}")

    if report.notes:
        print("\nNotes:")
        for n in report.notes:
            print(f"  - {n}")
    print()


def write_outputs(report: ScenarioReport, out_dir: Path) -> tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    json_path = out_dir / f"volume_{report.scenario}_{ts}.json"
    md_path = out_dir / f"volume_{report.scenario}_{ts}.md"

    payload = _report_to_dict(report)
    payload["generated_at_utc"] = datetime.now(timezone.utc).isoformat()
    json_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    dvf = report.processed.get("dvf_prices") or {}
    insee = report.processed.get("insee_demographics") or {}
    if isinstance(dvf, DatasetStats):
        dvf = asdict(dvf)
    if isinstance(insee, DatasetStats):
        insee = asdict(insee)

    lines = [
        f"# Benchmark volumétrie — {report.scenario}",
        "",
        f"**{report.label}** · `HOMEPEDIA_DVF_SAMPLE_CITIES={report.dvf_sample_cities}`",
        "",
        "## Durées",
        "",
        "| Étape | Secondes |",
        "|-------|----------|",
    ]
    for k, v in report.timings_sec.items():
        lines.append(f"| {k} | {v:.2f} |")
    if not report.timings_sec:
        lines.append("| _(non exécuté)_ | — |")

    lines.extend(
        [
            "",
            "## Volumes",
            "",
            "| Dataset | Taille | Lignes | Communes (city) |",
            "|---------|--------|--------|-----------------|",
            f"| DVF Parquet | {dvf.get('size_human', '—')} | {dvf.get('rows', '—')} | {dvf.get('unique_insee_codes', '—')} |",
            f"| INSEE Parquet | {insee.get('size_human', '—')} | {insee.get('rows', '—')} | {insee.get('unique_insee_codes', '—')} |",
            "",
            "## Notes",
            "",
        ]
    )
    for n in report.notes:
        lines.append(f"- {n}")

    md_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return json_path, md_path


def write_comparison_table(reports: list[ScenarioReport], out_dir: Path) -> Path:
    """Synthèse multi-scénarios pour slide volumétrie."""
    lines = [
        "# Synthèse volumétrie HOMEPEDIA",
        "",
        f"Généré : {datetime.now(timezone.utc).isoformat()}",
        "",
        "| Scénario | Communes cible | Ingestion (s) | DVF lignes | DVF communes | DVF Parquet | INSEE lignes | INSEE Parquet |",
        "|----------|----------------|---------------|------------|--------------|-------------|--------------|---------------|",
    ]
    for r in reports:
        dvf = r.processed.get("dvf_prices") or {}
        insee = r.processed.get("insee_demographics") or {}
        if isinstance(dvf, DatasetStats):
            dvf = asdict(dvf)
        if isinstance(insee, DatasetStats):
            insee = asdict(insee)
        lines.append(
            f"| {r.scenario} | {r.dvf_sample_cities} | "
            f"{r.timings_sec.get('ingest_total', 0):.2f} | "
            f"{dvf.get('rows', '—')} | {dvf.get('unique_insee_codes', '—')} | "
            f"{dvf.get('size_human', '—')} | "
            f"{insee.get('rows', '—')} | {insee.get('size_human', '—')} |"
        )
    lines.extend(
        [
            "",
            "## Méthode",
            "",
            "- Variable : `HOMEPEDIA_DVF_SAMPLE_CITIES` (DVF + INSEE).",
            "- Géo IGN désactivée pendant le benchmark (`HOMEPEDIA_SKIP_GEO=1`).",
            "- CSV DVF brut en cache local (~25 Mo) après 1er téléchargement.",
            "- NLP et Spark non inclus dans ces runs (relancer avec `--run-spark`).",
        ]
    )
    out_path = out_dir / "SYNTHESE_VOLUMETRIE.md"
    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return out_path


def compare_reports(reports: list[ScenarioReport]) -> None:
    print("\nComparaison des scénarios\n")
    header = f"{'Scénario':<12} {'Communes':>8} {'DVF lignes':>12} {'DVF Mo':>10} {'Ingest s':>10} {'Spark s':>10}"
    print(header)
    print("-" * len(header))
    for r in reports:
        dvf = r.processed.get("dvf_prices")
        if isinstance(dvf, dict):
            rows = dvf.get("rows")
            size = dvf.get("size_bytes", 0)
        else:
            rows = dvf.rows if dvf else None
            size = dvf.size_bytes if dvf else 0
        mo = size / (1024 * 1024) if size else 0
        print(
            f"{r.scenario:<12} {r.dvf_sample_cities:>8} "
            f"{(rows if rows is not None else '—'):>12} "
            f"{mo:>10.2f} "
            f"{r.timings_sec.get('ingest_total', 0):>10.2f} "
            f"{r.timings_sec.get('spark_aggregate', 0):>10.2f}"
        )
    print()


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark volumétrie HOMEPEDIA")
    parser.add_argument("command", choices=["report", "run", "compare"], help="report=état disque; run=ingestion; compare=plusieurs scénarios")
    parser.add_argument("--config", default="config/settings.yaml")
    parser.add_argument("--scenario", default="baseline", help="baseline | medium | high | all_cities")
    parser.add_argument("--scenarios", default="baseline,medium,high", help="Pour compare: liste séparée par des virgules")
    parser.add_argument("--run-ingest", action="store_true", default=None, help="Exécuter l'ingestion (défaut selon commande)")
    parser.add_argument("--no-ingest", action="store_true")
    parser.add_argument("--run-spark", action="store_true", help="Exécuter spark-submit via Docker après ingestion")
    parser.add_argument("--skip-geo", action="store_true", default=True, help="HOMEPEDIA_SKIP_GEO=1 (défaut: oui, plus rapide)")
    parser.add_argument("--with-geo", action="store_true", help="Inclure téléchargement IGN (lent en forte volumétrie)")
    parser.add_argument("--output-dir", default="reports/volumetry")
    parser.add_argument(
        "--skip-raw-count",
        action="store_true",
        help="Ne pas scanner le CSV DVF brut (fichier volumineux)",
    )
    args = parser.parse_args()

    if args.skip_raw_count:
        os.environ["HOMEPEDIA_SKIP_RAW_CITY_COUNT"] = "1"

    config_path = BASE_DIR / args.config
    cfg = _load_config(config_path)
    out_dir = BASE_DIR / args.output_dir

    if args.command == "report":
        scenarios = _load_scenarios(cfg)
        spec = scenarios.get(args.scenario, DEFAULT_SCENARIOS["baseline"])
        sample = int(spec.get("dvf_sample_cities", 50))
        report = collect_snapshot(
            cfg,
            scenario=args.scenario,
            sample_cities=sample,
            label=str(spec.get("label", args.scenario)),
        )
        report.notes.append("Mode report : aucune exécution pipeline.")
        print_report(report)
        write_outputs(report, out_dir)
        return 0

    run_ingest = args.run_ingest if args.run_ingest is not None else args.command in {"run", "compare"}
    if args.no_ingest:
        run_ingest = False
    skip_geo = not args.with_geo

    if args.command == "run":
        report = run_scenario(
            scenario=args.scenario,
            cfg=cfg,
            config_path=config_path,
            run_ingest=run_ingest,
            run_spark=args.run_spark,
            skip_geo=skip_geo,
        )
        print_report(report)
        jp, mp = write_outputs(report, out_dir)
        print(f"Rapports écrits : {jp.name}, {mp.name}")
        return 0 if not any("échou" in n for n in report.notes) else 1

    # compare
    names = [s.strip() for s in args.scenarios.split(",") if s.strip()]
    reports: list[ScenarioReport] = []
    for name in names:
        print(f"\n>>> Scénario {name}")
        r = run_scenario(
            scenario=name,
            cfg=cfg,
            config_path=config_path,
            run_ingest=run_ingest,
            run_spark=args.run_spark,
            skip_geo=skip_geo,
        )
        reports.append(r)
        write_outputs(r, out_dir)
    compare_reports(reports)
    synth = write_comparison_table(reports, out_dir)
    print(f"Synthèse : {synth}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
