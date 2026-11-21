#!/usr/bin/env python3
"""
LunarSite EVA — NASA/JPL Horizons Ephemeris Pipeline (Phase 1)

Fetches apparent topocentric azimuth and elevation of the Sun (COMMAND=10)
and Earth (COMMAND=399) as observed from lunar surface sites (CENTER=coord@301,
COORD_TYPE=GEODETIC) using the official JPL Horizons API.

Key guarantees:
- Fetches one month per request with deterministic disk caching in data/cache/.
- Limited retry policy with exponential backoff and polite inter-request delay.
- Strict parsing of $$SOE..$$EOE tables; never silently drops malformed rows.
- Strict timestamp-based alignment between Sun and Earth; never silently trims arrays.
- Separates public candidate sites (data/data.json) from validation-only sites
  (data/validation_data.json).
- Preserves legacy frontend keys while emitting full Phase 1 schema v2 metadata.
"""

from __future__ import annotations

import argparse
import calendar
import csv
import datetime as dt
import io
import json
import math
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

HORIZONS_API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"

TARGETS = {
    "sun": "10",
    "earth": "399",
}

DEFAULT_START = "2026-01-01T00:00:00Z"
DEFAULT_END = "2027-01-01T00:00:00Z"
DEFAULT_STEP_HOURS = 2
DEFAULT_MAX_RETRIES = 3
DEFAULT_RETRY_BASE_DELAY = 2.0
DEFAULT_REQUEST_PAUSE = 0.5
DEFAULT_TIMEOUT_SEC = 45


class HorizonsError(RuntimeError):
    """Raised when a Horizons API request, parse, or alignment fails."""


def parse_iso_utc(value: str) -> dt.datetime:
    """Parse an ISO-8601 UTC string (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ) into aware UTC datetime."""
    s = value.strip()
    if len(s) == 10:
        return dt.datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=dt.timezone.utc)
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    parsed = dt.datetime.fromisoformat(s)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc)


def format_iso_utc(ts: dt.datetime) -> str:
    """Format an aware UTC datetime as canonical ISO-8601 UTC."""
    return ts.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def format_horizons_time(ts: dt.datetime) -> str:
    """Format an aware UTC datetime for Horizons START_TIME / STOP_TIME."""
    return ts.astimezone(dt.timezone.utc).strftime("%Y-%m-%d %H:%M")


def parse_horizons_timestamp(raw: str) -> str:
    """
    Parse a Horizons calendar UTC timestamp (e.g. '2026-Jan-01 00:00' or
    '2026-Jan-01 00:00:00') into canonical ISO-8601 UTC 'YYYY-MM-DDTHH:MM:SSZ'.
    """
    text = raw.strip()
    for fmt in ("%Y-%b-%d %H:%M", "%Y-%b-%d %H:%M:%S", "%Y-%b-%d %H:%M:%S.%f"):
        try:
            parsed = dt.datetime.strptime(text, fmt).replace(tzinfo=dt.timezone.utc)
            return format_iso_utc(parsed)
        except ValueError:
            continue
    raise HorizonsError(f"Unrecognised Horizons timestamp format: {raw!r}")


def build_monthly_chunks(
    start_utc: dt.datetime,
    end_utc: dt.datetime,
    step_hours: int,
) -> list[tuple[str, dt.datetime, dt.datetime]]:
    """
    Partition [start_utc, end_utc] into non-overlapping monthly chunks aligned to step_hours.

    Each chunk is (chunk_label, chunk_start, chunk_stop) where Horizons is queried
    inclusively from chunk_start to chunk_stop. Adjacent chunks never share a boundary
    timestamp, avoiding duplicates while covering every step in [start_utc, end_utc].
    """
    if end_utc < start_utc:
        raise ValueError("end_utc must be >= start_utc")
    if step_hours <= 0 or 24 % step_hours != 0:
        raise ValueError(f"step_hours must be a positive divisor of 24, got {step_hours}")

    step_delta = dt.timedelta(hours=step_hours)
    chunks: list[tuple[str, dt.datetime, dt.datetime]] = []
    cur = start_utc

    while cur <= end_utc:
        year, month = cur.year, cur.month
        last_day = calendar.monthrange(year, month)[1]
        next_month_start = dt.datetime(year, month, last_day, tzinfo=dt.timezone.utc) + dt.timedelta(days=1)
        last_in_month = next_month_start - step_delta
        # If end_utc is exactly next_month_start (e.g. 2027-01-01T00:00:00Z),
        # include it as the inclusive stop of this final month chunk so Horizons
        # always receives START_TIME < STOP_TIME.
        if end_utc == next_month_start:
            chunk_stop = end_utc
        else:
            chunk_stop = min(last_in_month, end_utc)
        label = f"{year:04d}-{month:02d}"
        chunks.append((label, cur, chunk_stop))
        cur = chunk_stop + step_delta

    return chunks


def build_horizons_params(
    command: str,
    site_coord: str,
    start_utc: dt.datetime,
    stop_utc: dt.datetime,
    step_hours: int,
) -> dict[str, str]:
    """Build verified JPL Horizons API query parameters."""
    return {
        "format": "json",
        "COMMAND": f"'{command}'",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{site_coord}'",
        "START_TIME": f"'{format_horizons_time(start_utc)}'",
        "STOP_TIME": f"'{format_horizons_time(stop_utc)}'",
        "STEP_SIZE": f"'{step_hours}h'",
        "QUANTITIES": "'4'",
        "CSV_FORMAT": "'YES'",
        "CAL_FORMAT": "'CAL'",
        "ANG_FORMAT": "'DEG'",
        "APPARENT": "'AIRLESS'",
    }


def parse_horizons_ephemeris(result_text: str, context: str = "") -> list[tuple[str, float, float]]:
    """
    Strictly parse a Horizons CSV ephemeris response (QUANTITIES='4').

    Returns a list of (iso_utc_timestamp, azimuth_deg, elevation_deg).
    Raises HorizonsError on missing $$SOE/$$EOE markers, malformed rows,
    non-finite values, or empty tables. Never silently drops rows.
    """
    ctx = f" [{context}]" if context else ""
    if "$$SOE" not in result_text or "$$EOE" not in result_text:
        raise HorizonsError(f"Missing $$SOE/$$EOE ephemeris markers in Horizons response{ctx}")

    soe_idx = result_text.index("$$SOE") + len("$$SOE")
    eoe_idx = result_text.index("$$EOE", soe_idx)
    table_body = result_text[soe_idx:eoe_idx].strip()
    if not table_body:
        raise HorizonsError(f"Empty ephemeris table between $$SOE and $$EOE{ctx}")

    rows: list[tuple[str, float, float]] = []
    reader = csv.reader(io.StringIO(table_body))
    for line_num, fields in enumerate(reader, start=1):
        if not fields or all(not f.strip() for f in fields):
            continue
        # Expected CSV columns for QUANTITIES='4':
        # [0] Date__(UT)__HR:MN, [1] solar presence, [2] interfering body,
        # [3] Azi_(a-app), [4] Elev_(a-app), [5] trailing empty
        if len(fields) < 5:
            raise HorizonsError(
                f"Malformed CSV row {line_num} (expected >= 5 columns, got {len(fields)}): {fields!r}{ctx}"
            )
        ts_iso = parse_horizons_timestamp(fields[0])
        az_str = fields[3].strip()
        el_str = fields[4].strip()
        try:
            az = float(az_str)
            el = float(el_str)
        except ValueError as exc:
            raise HorizonsError(
                f"Non-numeric azimuth/elevation at row {line_num} ({ts_iso}): az={az_str!r}, el={el_str!r}{ctx}"
            ) from exc

        if not (math.isfinite(az) and math.isfinite(el)):
            raise HorizonsError(
                f"Non-finite azimuth/elevation at row {line_num} ({ts_iso}): az={az}, el={el}{ctx}"
            )
        # Normalise 360.0 -> 0.0 if exact boundary occurs, otherwise validate [0, 360)
        if az == 360.0:
            az = 0.0
        if not (0.0 <= az < 360.0):
            raise HorizonsError(f"Azimuth out of [0, 360) at {ts_iso}: {az}{ctx}")
        if not (-90.0 <= el <= 90.0):
            raise HorizonsError(f"Elevation out of [-90, 90] at {ts_iso}: {el}{ctx}")

        rows.append((ts_iso, az, el))

    if not rows:
        raise HorizonsError(f"No valid observations parsed from ephemeris table{ctx}")

    return rows


def align_sun_and_earth(
    sun_rows: list[tuple[str, float, float]],
    earth_rows: list[tuple[str, float, float]],
    expected_start: dt.datetime,
    expected_end: dt.datetime,
    step_hours: int,
    site_id: str,
) -> dict[str, Any]:
    """
    Strictly align Sun and Earth observations by exact UTC timestamp.

    Detects:
    - Duplicate timestamps in either series
    - Missing timestamps relative to [expected_start, expected_end] at step_hours
    - Unexpected timestamps / intervals
    - Any mismatch between Sun and Earth timestamp sets

    Never silently trims or drops observations. Raises HorizonsError on any discrepancy.
    """
    def index_series(rows: list[tuple[str, float, float]], target: str) -> dict[str, tuple[float, float]]:
        indexed: dict[str, tuple[float, float]] = {}
        duplicates: list[str] = []
        for ts, az, el in rows:
            if ts in indexed:
                duplicates.append(ts)
            else:
                indexed[ts] = (az, el)
        if duplicates:
            raise HorizonsError(
                f"Duplicate {target} timestamps for site '{site_id}': {duplicates[:5]} (total {len(duplicates)})"
            )
        return indexed

    sun_map = index_series(sun_rows, "sun")
    earth_map = index_series(earth_rows, "earth")

    # Build exact expected timestamp sequence
    expected_timestamps: list[str] = []
    cur = expected_start
    step_delta = dt.timedelta(hours=step_hours)
    while cur <= expected_end:
        expected_timestamps.append(format_iso_utc(cur))
        cur += step_delta

    expected_set = set(expected_timestamps)
    sun_set = set(sun_map.keys())
    earth_set = set(earth_map.keys())

    missing_sun = sorted(expected_set - sun_set)
    missing_earth = sorted(expected_set - earth_set)
    extra_sun = sorted(sun_set - expected_set)
    extra_earth = sorted(earth_set - expected_set)

    errors: list[str] = []
    if missing_sun:
        errors.append(f"missing {len(missing_sun)} Sun timestamps (first: {missing_sun[:3]})")
    if missing_earth:
        errors.append(f"missing {len(missing_earth)} Earth timestamps (first: {missing_earth[:3]})")
    if extra_sun:
        errors.append(f"unexpected {len(extra_sun)} Sun timestamps (first: {extra_sun[:3]})")
    if extra_earth:
        errors.append(f"unexpected {len(extra_earth)} Earth timestamps (first: {extra_earth[:3]})")
    if sun_set != earth_set:
        only_sun = sorted(sun_set - earth_set)
        only_earth = sorted(earth_set - sun_set)
        errors.append(
            f"Sun/Earth timestamp mismatch (only_sun={len(only_sun)}, only_earth={len(only_earth)})"
        )

    if errors:
        raise HorizonsError(f"Timestamp alignment failed for site '{site_id}': " + "; ".join(errors))

    sun_az: list[float] = []
    sun_elev: list[float] = []
    earth_az: list[float] = []
    earth_elev: list[float] = []

    for ts in expected_timestamps:
        s_az, s_el = sun_map[ts]
        e_az, e_el = earth_map[ts]
        sun_az.append(s_az)
        sun_elev.append(s_el)
        earth_az.append(e_az)
        earth_elev.append(e_el)

    return {
        "timestamps": expected_timestamps,
        "sun_az": sun_az,
        "sun_elev": sun_elev,
        "earth_az": earth_az,
        "earth_elev": earth_elev,
    }


def fetch_chunk_with_cache(
    site_id: str,
    target_name: str,
    command: str,
    site_coord: str,
    chunk_label: str,
    chunk_start: dt.datetime,
    chunk_stop: dt.datetime,
    step_hours: int,
    cache_dir: Path,
    force_refresh: bool = False,
    max_retries: int = DEFAULT_MAX_RETRIES,
    retry_base_delay: float = DEFAULT_RETRY_BASE_DELAY,
    request_pause: float = DEFAULT_REQUEST_PAUSE,
) -> tuple[list[tuple[str, float, float]], bool]:
    """
    Fetch one monthly chunk for (site, target), using deterministic disk cache.

    Returns (parsed_rows, from_cache).
    Never silently falls back to stale cache if a forced refresh fails.
    """
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file = cache_dir / f"{site_id}_{target_name}_{chunk_label}.json"
    params = build_horizons_params(command, site_coord, chunk_start, chunk_stop, step_hours)
    context = f"{site_id}/{target_name}/{chunk_label}"

    if cache_file.exists() and not force_refresh:
        try:
            cached = json.loads(cache_file.read_text(encoding="utf-8"))
            if cached.get("request_params") == params and "raw_response" in cached:
                result_text = cached["raw_response"].get("result", "")
                rows = parse_horizons_ephemeris(result_text, context=f"cache:{context}")
                return rows, True
        except Exception as exc:
            raise HorizonsError(
                f"Corrupted or mismatched cache file {cache_file}: {exc}. "
                "Re-run with --force-refresh to re-fetch."
            ) from exc

    url = f"{HORIZONS_API_URL}?{urllib.parse.urlencode(params)}"
    last_error: Exception | None = None

    for attempt in range(1, max_retries + 1):
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "LunarSiteEVA-EphemerisPipeline/2.0"},
            )
            with urllib.request.urlopen(req, timeout=DEFAULT_TIMEOUT_SEC) as resp:
                status = getattr(resp, "status", 200)
                if status != 200:
                    raise HorizonsError(f"HTTP {status} from Horizons API [{context}]")
                body = resp.read().decode("utf-8")

            raw_json = json.loads(body)
            if "error" in raw_json:
                raise HorizonsError(f"Horizons API error [{context}]: {raw_json['error']}")
            result_text = raw_json.get("result", "")
            if not result_text:
                raise HorizonsError(f"Empty 'result' field in Horizons response [{context}]")

            rows = parse_horizons_ephemeris(result_text, context=context)

            cache_payload = {
                "site_id": site_id,
                "target": target_name,
                "command": command,
                "chunk_label": chunk_label,
                "retrieved_at": format_iso_utc(dt.datetime.now(dt.timezone.utc)),
                "api_url": HORIZONS_API_URL,
                "request_params": params,
                "raw_response": raw_json,
            }
            cache_file.write_text(json.dumps(cache_payload, indent=2), encoding="utf-8")
            if request_pause > 0:
                time.sleep(request_pause)
            return rows, False

        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, HorizonsError, json.JSONDecodeError) as exc:
            last_error = exc
            if attempt < max_retries:
                delay = retry_base_delay * (2 ** (attempt - 1))
                print(
                    f"  [retry {attempt}/{max_retries - 1}] {context} failed: {exc}. "
                    f"Waiting {delay:.1f}s...",
                    file=sys.stderr,
                )
                time.sleep(delay)

    raise HorizonsError(
        f"Failed to fetch {context} after {max_retries} attempts "
        f"(start={format_horizons_time(chunk_start)}, stop={format_horizons_time(chunk_stop)}, "
        f"site_coord={site_coord}): {last_error}"
    )


def fetch_site_dataset(
    site: dict[str, Any],
    start_utc: dt.datetime,
    end_utc: dt.datetime,
    step_hours: int,
    cache_dir: Path,
    force_refresh: bool = False,
) -> dict[str, Any]:
    """Fetch, parse, and strictly align a full Sun + Earth dataset for one site."""
    site_id = site["id"]
    obs = site.get("horizons_observer_coordinates")
    if not obs or not obs.get("site_coord"):
        raise HorizonsError(f"Site '{site_id}' has no horizons_observer_coordinates configured.")

    site_coord = obs["site_coord"]
    chunks = build_monthly_chunks(start_utc, end_utc, step_hours)
    sun_rows: list[tuple[str, float, float]] = []
    earth_rows: list[tuple[str, float, float]] = []

    cached_count = 0
    fetched_count = 0

    for chunk_label, chunk_start, chunk_stop in chunks:
        for target_name, command in TARGETS.items():
            rows, from_cache = fetch_chunk_with_cache(
                site_id=site_id,
                target_name=target_name,
                command=command,
                site_coord=site_coord,
                chunk_label=chunk_label,
                chunk_start=chunk_start,
                chunk_stop=chunk_stop,
                step_hours=step_hours,
                cache_dir=cache_dir,
                force_refresh=force_refresh,
            )
            if from_cache:
                cached_count += 1
            else:
                fetched_count += 1
            if target_name == "sun":
                sun_rows.extend(rows)
            else:
                earth_rows.extend(rows)

    print(
        f"  {site_id}: {len(chunks)} chunks x 2 targets "
        f"(cached={cached_count}, fetched={fetched_count})"
    )

    aligned = align_sun_and_earth(
        sun_rows=sun_rows,
        earth_rows=earth_rows,
        expected_start=start_utc,
        expected_end=end_utc,
        step_hours=step_hours,
        site_id=site_id,
    )

    # Emit both Phase 1 schema v2 fields and legacy frontend keys for 100% compatibility
    return {
        "id": site_id,
        "name": site.get("short_name", site["name"]),
        "full_name": site["name"],
        "category": site["category"],
        "coordinate_status": site["coordinate_status"],
        "latitude": site["latitude"],
        "longitude": site["longitude"],
        "lat": site["latitude"],
        "lon": site["longitude"],
        "altitude_km": site.get("altitude_km", 0.0),
        "coordinate_source": site["coordinate_source"],
        "source_layer": site.get("source_layer"),
        "object_id": site.get("object_id"),
        "source": site.get("source_legacy", site["coordinate_source"]),
        "horizons_site_coord": site_coord,
        "image": site.get("image"),
        "start": format_iso_utc(start_utc),
        "end": format_iso_utc(end_utc),
        "step_hours": step_hours,
        "timestamps": aligned["timestamps"],
        "sun": {
            "azimuth": aligned["sun_az"],
            "elevation": aligned["sun_elev"],
        },
        "earth": {
            "azimuth": aligned["earth_az"],
            "elevation": aligned["earth_elev"],
        },
        "sun_elev": aligned["sun_elev"],
        "sun_az": aligned["sun_az"],
        "earth_elev": aligned["earth_elev"],
        "earth_az": aligned["earth_az"],
    }


def build_output_document(
    site_records: list[dict[str, Any]],
    start_utc: dt.datetime,
    end_utc: dt.datetime,
    step_hours: int,
    dataset_role: str,
) -> dict[str, Any]:
    generated_at = format_iso_utc(dt.datetime.now(dt.timezone.utc))
    return {
        "generated": generated_at,
        "metadata": {
            "source": "JPL Horizons",
            "api_endpoint": HORIZONS_API_URL,
            "generated_at": generated_at,
            "dataset_role": dataset_role,
            "time_system": "UTC",
            "start": format_iso_utc(start_utc),
            "end": format_iso_utc(end_utc),
            "step_hours": step_hours,
            "horizon_assumption": "Flat",
            "coordinate_system": "Lunar geodetic (coord@301, COORD_TYPE=GEODETIC, MEAN_ME)",
            "apparent_mode": "AIRLESS",
            "quantities": "4 (Apparent Azimuth & Elevation)",
            "schema_version": 2,
        },
        "sites": site_records,
    }


def main(argv: list[str] | None = None) -> int:
    script_dir = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(
        description="Fetch lunar Sun & Earth ephemerides from NASA/JPL Horizons."
    )
    parser.add_argument("--sites-file", type=Path, default=script_dir / "sites.json")
    parser.add_argument("--cache-dir", type=Path, default=script_dir / "cache")
    parser.add_argument("--output", type=Path, default=script_dir / "data.json")
    parser.add_argument("--validation-output", type=Path, default=script_dir / "validation_data.json")
    parser.add_argument("--start", default=DEFAULT_START, help="Start UTC (ISO-8601)")
    parser.add_argument("--end", default=DEFAULT_END, help="End UTC (ISO-8601)")
    parser.add_argument("--step-hours", type=int, default=DEFAULT_STEP_HOURS)
    parser.add_argument("--force-refresh", action="store_true", help="Ignore existing cache and re-fetch")
    parser.add_argument(
        "--only-sites",
        nargs="*",
        default=None,
        help="Optional list of site IDs to fetch (for targeted runs)",
    )
    args = parser.parse_args(argv)

    start_utc = parse_iso_utc(args.start)
    end_utc = parse_iso_utc(args.end)
    registry = json.loads(args.sites_file.read_text(encoding="utf-8"))

    only_set = set(args.only_sites) if args.only_sites else None

    def process_group(group_sites: list[dict[str, Any]], label: str) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for site in group_sites:
            sid = site["id"]
            if only_set is not None and sid not in only_set:
                continue
            if not site.get("fetch_enabled", False):
                print(f"  [skip] {sid}: fetch_enabled=false ({site.get('coordinate_status')})")
                continue
            print(f"[{label}] Processing {sid} ({site['name']})...")
            results.append(
                fetch_site_dataset(
                    site=site,
                    start_utc=start_utc,
                    end_utc=end_utc,
                    step_hours=args.step_hours,
                    cache_dir=args.cache_dir,
                    force_refresh=args.force_refresh,
                )
            )
        return results

    candidate_records = process_group(registry.get("candidate_sites", []), "candidate")
    validation_records = process_group(registry.get("validation_sites", []), "validation")

    if candidate_records:
        candidate_doc = build_output_document(
            candidate_records, start_utc, end_utc, args.step_hours, dataset_role="public_candidates"
        )
        args.output.write_text(json.dumps(candidate_doc, indent=2), encoding="utf-8")
        print(f"Wrote {len(candidate_records)} candidate sites to {args.output}")

    if validation_records:
        validation_doc = build_output_document(
            validation_records, start_utc, end_utc, args.step_hours, dataset_role="validation_references"
        )
        args.validation_output.write_text(json.dumps(validation_doc, indent=2), encoding="utf-8")
        print(f"Wrote {len(validation_records)} validation sites to {args.validation_output}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

