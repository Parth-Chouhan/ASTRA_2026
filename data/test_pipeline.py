"""Unit tests for the Phase 1 LunarSite EVA Horizons ephemeris pipeline."""

from __future__ import annotations

import datetime as dt
import pytest

from fetch_horizons import (
    HorizonsError,
    align_sun_and_earth,
    build_monthly_chunks,
    parse_horizons_ephemeris,
    parse_horizons_timestamp,
    parse_iso_utc,
)
from validate import ValidationSummary, validate_dataset_structure_and_values, validate_physical_sanity


SAMPLE_HORIZONS_RESULT = """
*******************************************************************************
 Date__(UT)__HR:MN, , ,Azi_(a-app), Elev_(a-app),
*************************************************
$$SOE
 2026-Jan-01 00:00,*,i, 102.591720,    80.731263,
 2026-Jan-01 02:00,*,i, 104.106281,    81.714943,
 2026-Jan-01 04:00,*,i, 106.027073,    82.691251,
$$EOE
*******************************************************************************
"""


def test_parse_horizons_timestamp():
    assert parse_horizons_timestamp("2026-Jan-01 00:00") == "2026-01-01T00:00:00Z"
    assert parse_horizons_timestamp(" 2026-Dec-31 22:00 ") == "2026-12-31T22:00:00Z"
    with pytest.raises(HorizonsError):
        parse_horizons_timestamp("2026/01/01 00:00")


def test_parse_horizons_ephemeris_valid():
    rows = parse_horizons_ephemeris(SAMPLE_HORIZONS_RESULT)
    assert len(rows) == 3
    assert rows[0] == ("2026-01-01T00:00:00Z", 102.59172, 80.731263)
    assert rows[2] == ("2026-01-01T04:00:00Z", 106.027073, 82.691251)


def test_parse_horizons_ephemeris_missing_markers():
    with pytest.raises(HorizonsError, match="Missing"):
        parse_horizons_ephemeris("no markers here")


def test_parse_horizons_ephemeris_rejects_malformed_row():
    bad = "$$SOE\n 2026-Jan-01 00:00,*,i, n.a., 80.73,\n$$EOE"
    with pytest.raises(HorizonsError, match="Non-numeric"):
        parse_horizons_ephemeris(bad)


def test_parse_horizons_ephemeris_rejects_out_of_range_angles():
    bad_el = "$$SOE\n 2026-Jan-01 00:00,*,i, 100.0, 95.0,\n$$EOE"
    with pytest.raises(HorizonsError, match="Elevation out of"):
        parse_horizons_ephemeris(bad_el)

    bad_az = "$$SOE\n 2026-Jan-01 00:00,*,i, -5.0, 10.0,\n$$EOE"
    with pytest.raises(HorizonsError, match="Azimuth out of"):
        parse_horizons_ephemeris(bad_az)


def test_build_monthly_chunks_non_overlapping_full_year():
    start = parse_iso_utc("2026-01-01T00:00:00Z")
    end = parse_iso_utc("2027-01-01T00:00:00Z")
    chunks = build_monthly_chunks(start, end, step_hours=2)
    assert len(chunks) == 12
    # Verify contiguous, non-overlapping coverage with start < stop for every chunk
    for _, c_start, c_stop in chunks:
        assert c_start < c_stop
    for i in range(1, len(chunks)):
        assert chunks[i][1] == chunks[i - 1][2] + dt.timedelta(hours=2)
    assert chunks[0][1] == start
    assert chunks[-1][2] == end


def test_align_sun_and_earth_exact_match():
    start = parse_iso_utc("2026-01-01T00:00:00Z")
    end = parse_iso_utc("2026-01-01T04:00:00Z")
    sun = [
        ("2026-01-01T00:00:00Z", 100.0, 10.0),
        ("2026-01-01T02:00:00Z", 102.0, 12.0),
        ("2026-01-01T04:00:00Z", 104.0, 14.0),
    ]
    earth = [
        ("2026-01-01T00:00:00Z", 200.0, 60.0),
        ("2026-01-01T02:00:00Z", 200.5, 60.1),
        ("2026-01-01T04:00:00Z", 201.0, 60.2),
    ]
    aligned = align_sun_and_earth(sun, earth, start, end, 2, "test_site")
    assert aligned["timestamps"] == [
        "2026-01-01T00:00:00Z",
        "2026-01-01T02:00:00Z",
        "2026-01-01T04:00:00Z",
    ]
    assert aligned["sun_elev"] == [10.0, 12.0, 14.0]
    assert aligned["earth_elev"] == [60.0, 60.1, 60.2]


def test_align_sun_and_earth_fails_on_missing_timestamp_no_silent_trim():
    start = parse_iso_utc("2026-01-01T00:00:00Z")
    end = parse_iso_utc("2026-01-01T04:00:00Z")
    sun = [
        ("2026-01-01T00:00:00Z", 100.0, 10.0),
        ("2026-01-01T02:00:00Z", 102.0, 12.0),
        ("2026-01-01T04:00:00Z", 104.0, 14.0),
    ]
    earth = [
        ("2026-01-01T00:00:00Z", 200.0, 60.0),
        ("2026-01-01T04:00:00Z", 201.0, 60.2),
    ]
    with pytest.raises(HorizonsError, match="Timestamp alignment failed"):
        align_sun_and_earth(sun, earth, start, end, 2, "test_site")


def test_align_sun_and_earth_fails_on_duplicate_timestamp():
    start = parse_iso_utc("2026-01-01T00:00:00Z")
    end = parse_iso_utc("2026-01-01T02:00:00Z")
    sun = [
        ("2026-01-01T00:00:00Z", 100.0, 10.0),
        ("2026-01-01T00:00:00Z", 100.0, 10.0),
        ("2026-01-01T02:00:00Z", 102.0, 12.0),
    ]
    earth = [
        ("2026-01-01T00:00:00Z", 200.0, 60.0),
        ("2026-01-01T02:00:00Z", 200.5, 60.1),
    ]
    with pytest.raises(HorizonsError, match="Duplicate sun timestamps"):
        align_sun_and_earth(sun, earth, start, end, 2, "test_site")


def test_validator_rejects_validation_site_in_public_dataset():
    doc = {
        "metadata": {
            "source": "JPL Horizons",
            "generated_at": "2026-11-22T00:00:00Z",
            "time_system": "UTC",
            "step_hours": 2,
            "horizon_assumption": "Flat",
            "coordinate_system": "Lunar geodetic",
            "schema_version": 2,
        },
        "sites": [
            {
                "id": "tsiolkovskiy",
                "name": "Tsiolkovskiy",
                "category": "validation_reference",
                "latitude": -20.0,
                "longitude": 129.0,
                "lat": -20.0,
                "lon": 129.0,
                "coordinate_source": "Validation reference",
                "timestamps": ["2026-01-01T00:00:00Z", "2026-01-01T02:00:00Z"],
                "sun": {"azimuth": [10.0, 12.0], "elevation": [5.0, 6.0]},
                "earth": {"azimuth": [180.0, 180.0], "elevation": [-40.0, -40.0]},
                "sun_az": [10.0, 12.0],
                "sun_elev": [5.0, 6.0],
                "earth_az": [180.0, 180.0],
                "earth_elev": [-40.0, -40.0],
            }
        ],
    }
    summary = ValidationSummary()
    validate_dataset_structure_and_values(doc, "candidate", summary, forbid_validation_sites=True)
    assert not summary.all_passed

