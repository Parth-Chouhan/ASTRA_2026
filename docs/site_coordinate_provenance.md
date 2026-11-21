# Site Coordinate Provenance Report

This document records the origin, coordinate convention, verification status, and Horizons observer mapping for every site in `data/sites.json`.

## Coordinate System & Horizons Mapping

- **Observer centre:** `CENTER='coord@301'` (topocentric surface location on the Moon, NAIF ID `301`).
- **Coordinate type:** `COORD_TYPE='GEODETIC'` (`E-lon(deg), Lat(deg), Alt(km)`).
- **Reference frame:** `MEAN_ME` (Moon Mean Earth/Polar Axis, high precision, East-longitude positive).
- **Reference surface:** Lunar reference sphere `R = 1737.4 km`; altitude `0.0 km` (flat geometric horizon assumption).
- **Longitude convention:** East-positive. Negative East longitudes (e.g., Malapert Massif `-0.23°`) are explicitly converted to `[0, 360)` East-positive (`359.77°`) when supplied to Horizons, with both original and converted values recorded in `data/sites.json`.

---

## 1. Public Candidate Sites (`data/data.json` -> `public/data.json`)

| ID | Name | Category | Original Coords (Lat, Lon) | Horizons `SITE_COORD` (Lon, Lat, Alt km) | Lon Conversion | Source & Layer | Object ID | Status |
|---|---|---|---|---|---|---|---|---|
| `apollo11` | Apollo 11 Lunar Module Eagle | `verified_candidate` | `0.67416° N, 23.47314° E` | `23.47314,0.67416,0.0` | None | LROC ACT QuickMap — *Anthropogenic Features* (read 2026-11-21) | `A11_LM` | **Verified** |
| `chandrayaan3` | Chandrayaan-3 Vikram Landing Site | `verified_candidate` | `-69.374° N, 32.3187° E` | `32.3187,-69.374,0.0` | None | LROC ACT QuickMap — *Anthropogenic Features* (read 2026-11-21) | `Vikram2` | **Verified** |
| `malapert` | Malapert Massif (region representative point) | `approximate_region_representative` | `-85.98° N, -0.23° E` | `359.77,-85.98,0.0` | `-0.23 + 360 = 359.77` | LROC ACT QuickMap — *A3: Candidate Landing Regions 2022* (read 2026-11-21) | `null` | **Approximate polygon representative** (~440 km² polygon; vertices not yet exported from QuickMap) |
| `mons_mouton` | Mons Mouton | `approximate_region_representative` | `-84.6° N, 31.0° E` | `31.0,-84.6,0.0` | None | LROC ACT QuickMap — *Nomenclature* (read 2026-11-21) | `null` | **Approximate nomenclature centre** (rounded to 0.1°) |
| `connecting_ridge` | Connecting Ridge | `unverified_candidate` | *Not yet confirmed* | *Excluded (`fetch_enabled: false`)* | N/A | Pending LROC ACT QuickMap confirmation | `null` | **Unverified — excluded from dataset** (no invented coordinates) |

---

## 2. Validation-Only Reference Sites (`data/validation_data.json` only)

These sites are **excluded from the public candidate dataset** (`data/data.json` and `public/data.json`) and are used strictly for automated physical sanity checks in `data/validate.py`.

| ID | Name | Original Coords (Lat, Lon) | Horizons `SITE_COORD` | Purpose |
|---|---|---|---|---|
| `south_pole` | South Pole (reference point) | `-89.9° N, 0.0° E` | `0.0,-89.9,0.0` | Verify solar elevation remains within ~1.5–1.7° of the horizon all year |
| `tsiolkovskiy` | Tsiolkovskiy Crater (far-side reference) | `-20.0° N, 129.0° E` | `129.0,-20.0,0.0` | Verify Earth is never visible above the geometric horizon on the lunar far side |

