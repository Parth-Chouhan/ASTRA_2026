# Phase 1 Automated Validation Report

- **Generated (UTC):** `2026-11-21T21:58:56Z`
- **Candidate dataset:** `data.json`
- **Validation dataset:** `validation_data.json`
- **Overall automated status:** **PASS** (42/42 checks passed)

> Note: Automated validation is distinct from Gate 1 manual JPL Horizons web-form verification. See `docs/horizons_api_settings.md` for the manual web-form comparison.

## Check Results

| Status | Check | Detail |
|---|---|---|
| PASS | `candidate: metadata present` | OK |
| PASS | `candidate/apollo11: required properties` | OK |
| PASS | `candidate/apollo11: numeric coordinates` | lat=0.67416, lon=23.47314 |
| PASS | `candidate/apollo11: equal array lengths` | n=4381 |
| PASS | `candidate/apollo11: azimuth in [0, 360)` | OK |
| PASS | `candidate/apollo11: elevation in [-90, 90]` | OK |
| PASS | `candidate/apollo11: temporal integrity` | 2026-01-01T00:00:00Z -> 2027-01-01T00:00:00Z (4381 steps, 2h) |
| PASS | `candidate/chandrayaan3: required properties` | OK |
| PASS | `candidate/chandrayaan3: numeric coordinates` | lat=-69.374, lon=32.3187 |
| PASS | `candidate/chandrayaan3: equal array lengths` | n=4381 |
| PASS | `candidate/chandrayaan3: azimuth in [0, 360)` | OK |
| PASS | `candidate/chandrayaan3: elevation in [-90, 90]` | OK |
| PASS | `candidate/chandrayaan3: temporal integrity` | 2026-01-01T00:00:00Z -> 2027-01-01T00:00:00Z (4381 steps, 2h) |
| PASS | `candidate/malapert: required properties` | OK |
| PASS | `candidate/malapert: numeric coordinates` | lat=-85.98, lon=-0.23 |
| PASS | `candidate/malapert: equal array lengths` | n=4381 |
| PASS | `candidate/malapert: azimuth in [0, 360)` | OK |
| PASS | `candidate/malapert: elevation in [-90, 90]` | OK |
| PASS | `candidate/malapert: temporal integrity` | 2026-01-01T00:00:00Z -> 2027-01-01T00:00:00Z (4381 steps, 2h) |
| PASS | `candidate/mons_mouton: required properties` | OK |
| PASS | `candidate/mons_mouton: numeric coordinates` | lat=-84.6, lon=31.0 |
| PASS | `candidate/mons_mouton: equal array lengths` | n=4381 |
| PASS | `candidate/mons_mouton: azimuth in [0, 360)` | OK |
| PASS | `candidate/mons_mouton: elevation in [-90, 90]` | OK |
| PASS | `candidate/mons_mouton: temporal integrity` | 2026-01-01T00:00:00Z -> 2027-01-01T00:00:00Z (4381 steps, 2h) |
| PASS | `validation: metadata present` | OK |
| PASS | `validation/south_pole: required properties` | OK |
| PASS | `validation/south_pole: numeric coordinates` | lat=-89.9, lon=0.0 |
| PASS | `validation/south_pole: equal array lengths` | n=4381 |
| PASS | `validation/south_pole: azimuth in [0, 360)` | OK |
| PASS | `validation/south_pole: elevation in [-90, 90]` | OK |
| PASS | `validation/south_pole: temporal integrity` | 2026-01-01T00:00:00Z -> 2027-01-01T00:00:00Z (4381 steps, 2h) |
| PASS | `validation/tsiolkovskiy: required properties` | OK |
| PASS | `validation/tsiolkovskiy: numeric coordinates` | lat=-20.0, lon=129.0 |
| PASS | `validation/tsiolkovskiy: equal array lengths` | n=4381 |
| PASS | `validation/tsiolkovskiy: azimuth in [0, 360)` | OK |
| PASS | `validation/tsiolkovskiy: elevation in [-90, 90]` | OK |
| PASS | `validation/tsiolkovskiy: temporal integrity` | 2026-01-01T00:00:00Z -> 2027-01-01T00:00:00Z (4381 steps, 2h) |
| PASS | `physical/apollo11: Earth always visible (near-side)` | Earth elevation range: [57.97, 73.95] deg |
| PASS | `physical/apollo11: ~29.5d solar cycle & high noon` | sunrises/year=12 (expected ~12.37), max_sun_elev=89.88 deg |
| PASS | `physical/tsiolkovskiy: Earth never visible (far-side)` | Earth elevation range: [-43.51, -29.43] deg |
| PASS | `physical/south_pole: Sun stays near horizon (~1.5-1.7 deg)` | Sun elevation range: [-1.585, 1.627] deg (max |el|=1.627 deg) |
