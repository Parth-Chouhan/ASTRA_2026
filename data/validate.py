#!/usr/bin/env python3
"""
LunarSite EVA — Ephemeris Dataset Validator (Phase 1)

Performs automated structural, temporal, angular, and physical sanity validation
on data/data.json (public candidate sites) and data/validation_data.json
(validation-only reference sites).

Optionally copies data/data.json -> public/data.json ONLY when all checks pass.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class CheckResult:
    name: str
    passed: bool
    detail: str


@dataclass
class ValidationSummary:
    checks: list[CheckResult] = field(default_factory=list)

    def record(self, name: str, passed: bool, detail: str) -> None:
        self.checks.append(CheckResult(name=name, passed=passed, detail=detail))

    @property
    def all_passed(self) -> bool:
        return all(c.passed for c in self.checks)


def parse_iso_utc(value: str) -> dt.datetime:
    s = value.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    return dt.datetime.fromisoformat(s).astimezone(dt.timezone.utc)


def is_finite_number(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def validate_dataset_structure_and_values(
    doc: dict[str, Any],
    label: str,
    summary: ValidationSummary,
    forbid_validation_sites: bool = False,
) -> None:
    meta = doc.get("metadata")
    required_meta = [
        "source",
        "generated_at",
        "time_system",
        "step_hours",
        "horizon_assumption",
        "coordinate_system",
        "schema_version",
    ]
    missing_meta = [k for k in required_meta if not isinstance(meta, dict) or k not in meta]
    summary.record(
        f"{label}: metadata present",
        len(missing_meta) == 0 and meta.get("schema_version") == 2,
        "OK" if not missing_meta else f"Missing metadata fields: {missing_meta}",
    )

    sites = doc.get("sites")
    if not isinstance(sites, list) or not sites:
        summary.record(f"{label}: sites non-empty", False, "sites list is missing or empty")
        return

    expected_step_hours = meta.get("step_hours", 2) if isinstance(meta, dict) else 2

    for site in sites:
        sid = site.get("id", "<missing-id>")
        if forbid_validation_sites and site.get("category") == "validation_reference":
            summary.record(
                f"{label}/{sid}: public candidate separation",
                False,
                "Validation-only reference site found in public candidate dataset",
            )

        # Required site properties
        req_props = [
            "id",
            "name",
            "latitude",
            "longitude",
            "lat",
            "lon",
            "coordinate_source",
            "timestamps",
            "sun",
            "earth",
            "sun_elev",
            "sun_az",
            "earth_elev",
            "earth_az",
        ]
        missing_props = [k for k in req_props if k not in site]
        summary.record(
            f"{label}/{sid}: required properties",
            len(missing_props) == 0,
            "OK" if not missing_props else f"Missing: {missing_props}",
        )
        if missing_props:
            continue

        # Valid numeric coordinates
        lat, lon = site["latitude"], site["longitude"]
        coords_ok = (
            is_finite_number(lat)
            and is_finite_number(lon)
            and -90.0 <= lat <= 90.0
            and -180.0 <= lon <= 360.0
        )
        summary.record(
            f"{label}/{sid}: numeric coordinates",
            coords_ok,
            f"lat={lat}, lon={lon}",
        )

        # Array lengths & legacy/v2 consistency
        ts = site["timestamps"]
        s_az = site["sun"]["azimuth"]
        s_el = site["sun"]["elevation"]
        e_az = site["earth"]["azimuth"]
        e_el = site["earth"]["elevation"]

        lengths = {
            "timestamps": len(ts),
            "sun.azimuth": len(s_az),
            "sun.elevation": len(s_el),
            "earth.azimuth": len(e_az),
            "earth.elevation": len(e_el),
            "sun_az": len(site["sun_az"]),
            "sun_elev": len(site["sun_elev"]),
            "earth_az": len(site["earth_az"]),
            "earth_elev": len(site["earth_elev"]),
        }
        same_len = len(set(lengths.values())) == 1 and lengths["timestamps"] > 0
        summary.record(
            f"{label}/{sid}: equal array lengths",
            same_len,
            f"n={lengths['timestamps']}" if same_len else f"Mismatched lengths: {lengths}",
        )

        # Finite values & angular bounds
        az_bad = [v for v in (s_az + e_az) if not is_finite_number(v) or not (0.0 <= v < 360.0)]
        el_bad = [v for v in (s_el + e_el) if not is_finite_number(v) or not (-90.0 <= v <= 90.0)]
        summary.record(
            f"{label}/{sid}: azimuth in [0, 360)",
            len(az_bad) == 0,
            "OK" if not az_bad else f"{len(az_bad)} out-of-range/non-finite azimuth values",
        )
        summary.record(
            f"{label}/{sid}: elevation in [-90, 90]",
            len(el_bad) == 0,
            "OK" if not el_bad else f"{len(el_bad)} out-of-range/non-finite elevation values",
        )

        # Temporal validation: chronological, unique, exact step_hours interval
        parsed_ts = [parse_iso_utc(t) for t in ts]
        unique_ok = len(set(ts)) == len(ts)
        expected_delta = dt.timedelta(hours=expected_step_hours)
        bad_intervals = [
            (ts[i - 1], ts[i])
            for i in range(1, len(parsed_ts))
            if (parsed_ts[i] - parsed_ts[i - 1]) != expected_delta
        ]
        summary.record(
            f"{label}/{sid}: temporal integrity",
            unique_ok and len(bad_intervals) == 0,
            f"{ts[0]} -> {ts[-1]} ({len(ts)} steps, {expected_step_hours}h)"
            if (unique_ok and not bad_intervals)
            else f"unique={unique_ok}, bad_intervals={len(bad_intervals)}",
        )


def validate_physical_sanity(
    candidate_doc: dict[str, Any],
    validation_doc: dict[str, Any] | None,
    summary: ValidationSummary,
) -> None:
    all_sites: dict[str, dict[str, Any]] = {}
    for s in candidate_doc.get("sites", []):
        all_sites[s["id"]] = s
    if validation_doc:
        for s in validation_doc.get("sites", []):
            all_sites[s["id"]] = s

    # 1. Apollo 11: Near-side equatorial site
    if "apollo11" in all_sites:
        a11 = all_sites["apollo11"]
        e_el = a11["earth"]["elevation"]
        s_el = a11["sun"]["elevation"]
        min_e, max_e = min(e_el), max(e_el)
        max_s = max(s_el)
        # Count sunrises (transitions from <= 0 to > 0)
        sunrises = sum(1 for i in range(1, len(s_el)) if s_el[i - 1] <= 0 < s_el[i])
        summary.record(
            "physical/apollo11: Earth always visible (near-side)",
            min_e > 0.0,
            f"Earth elevation range: [{min_e:.2f}, {max_e:.2f}] deg",
        )
        summary.record(
            "physical/apollo11: ~29.5d solar cycle & high noon",
            11 <= sunrises <= 13 and max_s > 85.0,
            f"sunrises/year={sunrises} (expected ~12.37), max_sun_elev={max_s:.2f} deg",
        )

    # 2. Tsiolkovskiy: Far-side reference
    if "tsiolkovskiy" in all_sites:
        tsio = all_sites["tsiolkovskiy"]
        e_el = tsio["earth"]["elevation"]
        min_e, max_e = min(e_el), max(e_el)
        summary.record(
            "physical/tsiolkovskiy: Earth never visible (far-side)",
            max_e < 0.0,
            f"Earth elevation range: [{min_e:.2f}, {max_e:.2f}] deg",
        )

    # 3. South Pole: Solar elevation near horizon all year
    if "south_pole" in all_sites:
        sp = all_sites["south_pole"]
        s_el = sp["sun"]["elevation"]
        min_s, max_s = min(s_el), max(s_el)
        max_abs = max(abs(min_s), abs(max_s))
        # Moon axial tilt ~1.54 deg + 0.1 deg offset from -89.9 deg latitude => ~1.65 deg bound
        summary.record(
            "physical/south_pole: Sun stays near horizon (~1.5-1.7 deg)",
            max_abs <= 1.8,
            f"Sun elevation range: [{min_s:.3f}, {max_s:.3f}] deg (max |el|={max_abs:.3f} deg)",
        )


def write_validation_report(
    summary: ValidationSummary,
    report_path: Path,
    candidate_path: Path,
    validation_path: Path | None,
) -> None:
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    passed_count = sum(1 for c in summary.checks if c.passed)
    total_count = len(summary.checks)
    status = "PASS" if summary.all_passed else "FAIL"

    lines = [
        "# Phase 1 Automated Validation Report",
        "",
        f"- **Generated (UTC):** `{now}`",
        f"- **Candidate dataset:** `{candidate_path.name}`",
        f"- **Validation dataset:** `{validation_path.name if validation_path else 'none'}`",
        f"- **Overall automated status:** **{status}** ({passed_count}/{total_count} checks passed)",
        "",
        "> Note: Automated validation is distinct from Gate 1 manual JPL Horizons web-form verification. See `docs/horizons_api_settings.md` for the manual web-form comparison.",
        "",
        "## Check Results",
        "",
        "| Status | Check | Detail |",
        "|---|---|---|",
    ]
    for c in summary.checks:
        icon = "PASS" if c.passed else "FAIL"
        lines.append(f"| {icon} | `{c.name}` | {c.detail} |")

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir.parent

    parser = argparse.ArgumentParser(description="Validate LunarSite EVA ephemeris datasets.")
    parser.add_argument("--data", type=Path, default=script_dir / "data.json")
    parser.add_argument("--validation-data", type=Path, default=script_dir / "validation_data.json")
    parser.add_argument("--report", type=Path, default=repo_root / "docs" / "validation_report.md")
    parser.add_argument(
        "--deploy",
        action="store_true",
        help="Copy data/data.json to public/data.json ONLY if all validations pass.",
    )
    parser.add_argument("--public-target", type=Path, default=repo_root / "public" / "data.json")
    args = parser.parse_args(argv)

    summary = ValidationSummary()
    candidate_doc = json.loads(args.data.read_text(encoding="utf-8"))
    validate_dataset_structure_and_values(
        candidate_doc, "candidate", summary, forbid_validation_sites=True
    )

    validation_doc = None
    if args.validation_data.exists():
        validation_doc = json.loads(args.validation_data.read_text(encoding="utf-8"))
        validate_dataset_structure_and_values(
            validation_doc, "validation", summary, forbid_validation_sites=False
        )
    else:
        summary.record(
            "validation_data.json present",
            False,
            f"Missing validation dataset at {args.validation_data}",
        )

    validate_physical_sanity(candidate_doc, validation_doc, summary)
    write_validation_report(summary, args.report, args.data, args.validation_data if validation_doc else None)

    for c in summary.checks:
        tag = "PASS" if c.passed else "FAIL"
        print(f"[{tag}] {c.name}: {c.detail}")

    if not summary.all_passed:
        print("Validation FAILED. public/data.json was NOT updated.", file=sys.stderr)
        return 1

    if args.deploy:
        shutil.copy2(args.data, args.public_target)
        print(f"Deployed validated dataset to {args.public_target}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

