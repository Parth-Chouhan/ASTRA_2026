# Lunar Landing Site Evaluator: Claude Code kit

Two parts:
- **Part 1** goes in the repo root as `CLAUDE.md` (Claude Code reads it every session).
- **Part 2** is the kickoff prompt you paste into Claude Code first.
- **Part 3** has the follow-up prompts, one per phase / person.

---

# PART 1: CLAUDE.md (save in repo root)

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

---

# PART 2: KICKOFF PROMPT (paste into Claude Code in the repo root)

```
Read CLAUDE.md fully first. We are building the Lunar Landing Site Evaluator and
it is hour 0. Do Phase 0 only; do not start the dome, satellite or any feature
beyond what is listed.

Phase 0 tasks:
1. Create the repo layout: /data (scripts, cache), /web (React + Vite + Tailwind
   + Plotly), /docs. Add .gitignore (ignore node_modules, but KEEP data/cache and
   data/data.json committed so teammates don't need to refetch), a README with run
   instructions.
2. Write data/fake_data.json following the schema in CLAUDE.md, with 3 fake sites
   (clearly named "FAKE ..."), one month of 2-hour steps, sinusoidal-ish values so
   the UI has something to show. This lets Person B and C work immediately.
3. Scaffold /web: Vite + React + Tailwind + Plotly. Build a page that loads
   data.json (fall back to fake_data.json), has a site dropdown, and a Sun and
   Earth elevation chart with a dashed line at 0 degrees. Keep it simple and
   clean; Sun = yellow, Earth = blue, consistently everywhere.
4. Write data/fetch_horizons.py:
   - Calls the JPL Horizons API for the Sun (command 10) and Earth (command 399)
     as seen from a point on the Moon (CENTER='coord@301', geodetic site coords,
     QUANTITIES for azimuth and elevation, 2-hour step). VERIFY every parameter
     name and the site-coordinate order/units against the official Horizons API
     documentation before using; print what you verified.
   - Site list lives in data/sites.json (id, name, lat, lon, source). Start with
     Apollo 11 only; other sites have lat/lon marked TODO_VERIFY until Person C
     reads them in Quickmap.
   - Fetch in monthly chunks, cache each raw response under data/cache/, skip
     cached chunks, retry with delay, pause between requests, join chunks, and
     write data/data.json in the schema.
   - CLI flags: --site <id>, --start, --days, --all.
5. Write data/validate.py implementing the Gate 1 checks that can be automated
   (array lengths equal, elevation within [-90,90], polar-site Sun elevation
   range, Apollo 11 day/night period about 29.5 days, Earth never above horizon
   on a far-side site) and a --compare mode that prints our value for a given
   timestamp so we can compare it with the Horizons web form by hand.
6. Tell me clearly if you cannot reach ssd.jpl.nasa.gov from this environment
   (network allowlist). If so, do not fake data: make the script ready to run on
   a laptop, and explain the exact command.

When finished, summarise: what exists, what was verified against the docs, what
still needs a human (site coordinates from Quickmap, web-form comparison), and
the exact commands to run the fetch, validation and the web app.
```

---

# PART 3: FOLLOW-UP PROMPTS (use in order)

### Person A: after Apollo 11 matches the web form
```
Apollo 11 matches the Horizons web form. Add all sites in data/sites.json (I will
fill the verified coordinates), run the full-year fetch in the background with
caching, then run validate.py on every site and report failures per check. Do not
change the schema.
```

### Person C: metrics module (hour 1-4)
```
Create /web/src/metrics/ with pure functions: sunlitPercent, earthVisiblePercent,
bothAvailablePercent, longestDarknessHours, hoursToNextSunsetOrEarthset,
perDaySunlitPercent, and viabilityRating (rule printed on screen). Inputs are the
elevation arrays plus step_hours and a start index/window. Add Vitest unit tests
with small hand-made arrays (all dark, all lit, one gap, boundary at 0 degrees).
Flat-horizon assumption documented in comments.
```

### Person B/C: visuals (hour 6-8, after Gate 1)
```
Gate 1 passed. Using the metrics module and data.json, add: ring gauges for
sunlit % and Earth-visible %, a timeline strip (Sun bar, Earth bar, and a "both"
bar), highlighted longest-darkness block, countdown cards, a side-by-side compare
for two sites or two dates, and a launch-slip calendar heatmap (sunlit % per day).
Show exact numbers next to every graphic and a note under gauges about the flat
horizon. Add a site card with screenshot and coordinate source.
```

### Person B: 2D then 3D dome (hour 6-9)
```
Build the 2D polar sky view first (azimuth = angle, 90-elevation = radius, N/E/S/W
marks, horizon ring, Sun and Earth positions, track lines, time slider and play
button, "sizes enlarged, not to scale" label). When it works and matches
the Gate 1 orientation check, add a Three.js version using the formulas in
CLAUDE.md: ground disc, horizon ring with labels, OrbitControls, Sun and Earth
discs, same slider. Keep the 2D view as a toggle/fallback. Stop and tell me if the
3D version takes more than about an hour.
```

### Person A: satellite module (hour 5-8, standalone)
```
Write /web/src/satellite/ as a pure JS module following the model in CLAUDE.md
(verify constants first). API: simulate(site, startTime, endTime, altitudeKm,
startAngleDeg) returning elevation samples every 2 min, passes (start, end, max
elevation), longest gap, and combined coverage given an Earth-visible array.
Vitest tests: period about 118 min at 100 km, near-pole passes about every 2 h
of about 12 min, equatorial site shows multi-day windows separated by gaps,
elevations within [-90, 90]. Do not wire it into the UI until I confirm the
results look right.
```

### Everyone: explorer mode, freeze and pitch (hour 8-12)
```
Add Explorer mode: plain-language explanations for each metric plus 3-4 CSA Moon
Exploration facts with source links (Person C supplies the verified facts; do not
invent any). Then: check mobile and desktop layouts, verify every on-screen limit
label is present, run all tests, and deploy. After that, generate a 2-minute demo
script that walks: pick site -> metrics -> compare -> calendar -> sky dome slider
-> relay satellite filling an Earth gap -> honest limits.
```

---

# Daily workflow (how to use this with Claude Code)
1. One person runs the kickoff prompt; push to GitHub; others pull.
2. Each person works in a branch (`a-data`, `b-frontend`, `c-metrics`) and uses their own Claude Code session with the Part 3 prompt for their role.
3. Merge to `main` at hour 4-6 (Gate 1 meeting), then after the freeze at 9.5.
4. If something breaks, use the fallback list in CLAUDE.md rule 5 and tell the team.
