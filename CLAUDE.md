## Project
Lunar Landing Site Evaluator for an overnight space hackathon (Domain 05: Moon, Mars and deep-space exploration). Team of 3 people plus AI agents, about 12 hours.

For a Moon site and date, show when the Sun (power) and Earth (direct comms) are above the local horizon, so planners can compare sites and dates in seconds instead of hours. Pitch it as a **fast first screening tool**.

## Architecture (no backend)
```
JPL Horizons API -> Python fetch script -> data/data.json -> React + Plotly (static site)
                    (caches every raw response)             (all metrics, dome, satellite computed in browser)
```
- Fetch script runs once on a laptop. The website only reads `data.json`.
- Repo layout: `/data` (fetch + validate scripts, cache, data.json), `/web` (React + Vite + Tailwind + Plotly + Three.js), `/docs`.

## data.json schema (single source of truth, do not change without telling the team)
```json
{
  "generated": "ISO timestamp",
  "sites": [{
    "id": "apollo11", "name": "Apollo 11", "lat": 0.0, "lon": 0.0,
    "source": "Quickmap (state which layer / date read)",
    "image": "apollo11.png",
    "start": "2026-01-01T00:00:00Z", "step_hours": 2,
    "sun_elev": [], "sun_az": [], "earth_elev": [], "earth_az": []
  }]
}
```
Degrees. Azimuth is measured from north toward east. Elevation is above the local horizon. All arrays have the same length (about 4380 for a year at 2 h). Coordinates are east-positive longitude, geodetic.

## Rules
1. **Never invent data.** Site coordinates come from Quickmap (read them there and record the source). Placeholders must be marked `TODO_VERIFY` in code and in the UI.
2. **Verify, don't assume.** Check Horizons parameter names against the official API docs. Check physical constants against a trusted source before use.
3. **Cache every Horizons response** to `data/cache/` (one file per site, body and month). Re-runs must skip cached files and be resumable. Retry on failure with a short delay, and pause between requests.
4. **Gates.** Do NOT build the 3D dome or satellite features in the app until Gate 1 passes (see Validation). Feature freeze at hour 9.5.
5. **Fallbacks.** 2D polar sky view is a complete feature. If 3D takes more than about 1 hour, keep 2D. If the satellite results look wrong, drop it and call it future work. Do not ship wrong numbers.
6. **Honest limits must appear in the UI**: flat horizon (no terrain shadows), power measure `sin(sun_elev)` is a rough indicator, satellite is an "Example relay orbit", Sun and Earth sizes on the dome are enlarged (not to scale).
7. Draw all charts, the dome and satellite ourselves (Plotly, SVG, Three.js). No ready-made simulation or model. Use plain colours instead of textures unless the licence is checked.
8. Keep changes small and tested. Run the tests before saying something is done.

## Metrics (JavaScript module in `/web/src/metrics/`, with unit tests)
- **Sunlit %** and **Earth-visible %**: share of steps with elevation > 0 over the chosen window.
- **Both available %**: steps where Sun AND Earth are above 0.
- **Longest darkness** (hours): longest continuous run with Sun <= 0.
- **Time to next sunset / Earthset** from the chosen date.
- **Per-day sunlit %** array for the launch-slip calendar heatmap.
- **Viability colour** (green/yellow/red) from a simple rule shown on screen.
- Power proxy = `sin(sun_elev)` clipped at 0, labelled "rough indicator".

## Sky dome maths
```
x = cos(el) * sin(az)      (east)
y = sin(el)                (up)
z = -cos(el) * cos(az)     (north is -z)
position = distance * (x, y, z)
```
Build the 2D polar plot first (angle = azimuth, radius = 90 - elevation), then upgrade to Three.js. Below-horizon bodies are dimmed or hidden. Label: "Sizes enlarged for visibility, not to scale."

## Relay satellite model (example orbit)
```
R = 1737.4 km; mu = 4902.8 km^3/s^2 (verify)
a = R + altitude (default 100 km); T = 2*pi*sqrt(a^3/mu)  (about 7,070 s at 100 km)
theta = 2*pi*t/T ; inertial: (a cos theta, 0, a sin theta)   (polar orbit, fixed plane)
Moon turns phi = 2*pi*t/(27.32 days); rotate into Moon-fixed frame
site = R*(cos lat cos lon, cos lat sin lon, sin lat)
elevation = asin( dot(sat - site, up) / |sat - site| ); visible if > 0
```
Step 1-2 minutes, only for the selected site and window. Metrics: passes per day, pass length, longest gap, combined coverage = Earth visible OR satellite visible. Not modelled: Earth blocked from the satellite by the Moon, orbit drift.

## Validation (Gate 1) checks
| Check | Expect |
|---|---|
| South pole Sun height | within about 1.5 degrees of horizon all year |
| Apollo 11 (equatorial) | Sun rises/sets about every 29.5 days, high at local noon |
| Near vs far side | Earth almost fixed in sky on near side, never visible on far side |
| Script vs Horizons web form | one site/time matches the web-form value |
| Dome orientation | Sun at az near 0 appears toward the N mark |
| Satellite period | about 118 min at 100 km; near-pole passes about every 2 h, about 12 min each |
| Satellite equatorial site | multi-day coverage windows separated by long gaps |
| Elevation bounds | always in [-90, 90] |

## Roles
- **A: Science and data**: Horizons pipeline, validation, satellite maths.
- **B: Frontend and 3D**: React app, dashboard, dome.
- **C: Research and product**: sites (Quickmap), CSA facts with source links, metric module and visuals, pitch.
