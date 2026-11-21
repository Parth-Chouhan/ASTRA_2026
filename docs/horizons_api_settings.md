# NASA/JPL Horizons API Settings & Gate 1 Verification

## 1. Verified API Configuration

- **Endpoint:** `https://ssd.jpl.nasa.gov/api/horizons.api`
- **Response format:** `format=json` (JSON wrapper containing `result` text with CSV ephemeris between `$$SOE` and `$$EOE`)
- **Targets:**
  - Sun: `COMMAND='10'`
  - Earth: `COMMAND='399'`
- **Observer Configuration:**
  - `EPHEM_TYPE='OBSERVER'`
  - `CENTER='coord@301'` — Custom topocentric surface location on the Moon (NAIF/Horizons body ID `301`, ephemeris `DE441`).
  - `COORD_TYPE='GEODETIC'` — Planetodetic/geodetic coordinates on the lunar reference sphere (`R = 1737.4 km`).
  - `SITE_COORD='<lon_east_deg>,<lat_north_deg>,<alt_km>'` — Longitude in degrees East-positive, latitude in degrees North-positive, altitude in kilometres above the `1737.4 km` lunar reference sphere (`0.0` for flat-horizon baseline).
- **Time & Output Configuration:**
  - `START_TIME='YYYY-MM-DD HH:MM'`, `STOP_TIME='YYYY-MM-DD HH:MM'` (UT/UTC)
  - `STEP_SIZE='2h'` (120 minutes)
  - `QUANTITIES='4'` — Apparent topocentric azimuth (`Azi_(a-app)`) and elevation (`Elev_(a-app)`) in degrees.
  - `APPARENT='AIRLESS'` — No atmospheric refraction (Moon is airless).
  - `CSV_FORMAT='YES'`, `CAL_FORMAT='CAL'`, `ANG_FORMAT='DEG'`, `OBJ_DATA='NO'`, `MAKE_EPHEM='YES'`

### Verification from Live Horizons Response Header

```text
Center body name: Moon (301)                      {source: DE441}
Center geodetic : 23.47314, .67416, -4.31358E-13  {E-lon(deg),Lat(deg),Alt(km)}
Center pole/equ : MEAN_ME (high precision)        {East-longitude positive}
Center radii    : 1737.4, 1737.4, 1737.4 km       {Equator_a, b, pole_c}
Atmos refraction: NO (AIRLESS)
```

Azimuth is measured clockwise from North (`N=0°, E=90°, S=180°, W=270°`) in `[0, 360)`. Elevation is measured above the local horizontal plane perpendicular to the reference surface zenith in `[-90, 90]`.

---

## 2. Gate 1 — Manual JPL Horizons Web-Form Verification

**Status:** **PENDING MANUAL COMPLETION** (Automated browser verification was blocked because Google Chrome remote debugging `DevToolsActivePort` was unavailable in this environment; manual verification is NOT claimed complete until performed.)

### Reference Test Case to Verify in Web Form

Open [NASA/JPL Horizons Web Application](https://ssd.jpl.nasa.gov/horizons/app.html#/) and enter:

- **Ephemeris Type:** `Observer Table`
- **Observer Location:** `Specify Coordinates` -> Body: `Moon (301)` -> `Geodetic` -> `23.47314° E, 0.67416° N, 0 km` (Apollo 11 Lunar Module Eagle)
- **Time Specification:** `2026-01-01 00:00` to `2026-01-01 02:00`, Step `2 hours` (UT)
- **Table Settings:** Quantity `4` (Apparent AZ & EL), `Airless`

### Comparison Table

| Target | Timestamp (UTC) | API Azimuth (deg) | API Elevation (deg) | Web-Form Azimuth (deg) | Web-Form Elevation (deg) | Difference | Tolerance | Result |
|---|---|---|---|---|---|---|---|---|
| Sun (`10`) | `2026-01-01T00:00:00Z` | `102.591720` | `80.731263` | *Pending manual check* | *Pending manual check* | — | `<= 0.001°` | **PENDING** |
| Earth (`399`) | `2026-01-01T00:00:00Z` | `32.865036` | `4.724960` | *Pending manual check* | *Pending manual check* | — | `<= 0.001°` | **PENDING** |

