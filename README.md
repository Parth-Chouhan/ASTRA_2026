# Lunar Landing Site Evaluator

Fast first-screening tool for lunar landing sites: when are the Sun (power) and Earth (direct comms) above the local horizon?

Built for a space hackathon (Domain 05: Moon, Mars and deep-space exploration).

## Quick Start

```bash
npm install
npm run dev      # Start dev server
npm run build    # Production build
npm run test     # Run unit tests
npm run lint     # Lint with oxlint
```

## Project Structure

```
├── public/              Static assets (images, data files, favicon)
├── src/
│   ├── main.jsx         Entry point
│   ├── App.jsx          Root component
│   ├── components/      UI components (gauges, charts, 3D views, panels)
│   ├── metrics/         Elevation-based metrics (sunlit %, Earth visible %, etc.)
│   └── satellite/       Relay satellite orbit simulator
├── data/                Data pipeline reference files
├── e2e/                 End-to-end Playwright tests
├── docs/                Documentation & workflow references
├── scripts/             Python utility scripts
├── index.html           Vite entry
├── vite.config.js       Vite + React + Tailwind config
└── playwright.config.js E2E test config
```

## Architecture

```
JPL Horizons API -> Python fetch script -> public/data.json -> React + Plotly (static site)
                    (caches every raw response)                 (all metrics, dome, satellite computed in browser)
```

## Tech Stack

- **Framework**: React 19 + Vite 8
- **Styling**: Tailwind CSS 4
- **Charts**: Plotly.js / react-plotly.js
- **3D**: Three.js
- **Icons**: Lucide React
- **Testing**: Vitest (unit), Playwright (e2e)
- **Linting**: oxlint
