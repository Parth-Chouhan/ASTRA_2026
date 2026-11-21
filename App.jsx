import React, { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, Layers, Columns2, Compass } from 'lucide-react';
import {
  sunlitPercent,
  earthVisiblePercent,
  bothAvailablePercent,
  longestDarknessHours,
  longestEarthGapHours,
  hoursToNextSunsetOrEarthset,
  perDayBothPercent,
} from './metrics/metrics.js';
import { simulate } from './satellite/satellite.js';
import RingGauge from './components/RingGauge.jsx';
import ViabilityIndicator from './components/ViabilityIndicator.jsx';
import MetricCards from './components/MetricCards.jsx';
import TimelineStrip from './components/TimelineStrip.jsx';
import ElevationChart from './components/ElevationChart.jsx';
import LaunchSlipCalendar from './components/LaunchSlipCalendar.jsx';
import SiteCard from './components/SiteCard.jsx';
import DateRangeControl from './components/DateRangeControl.jsx';
import CompareMode from './components/CompareMode.jsx';
import LimitsFooter from './components/LimitsFooter.jsx';
import PolarSkyView from './components/PolarSkyView.jsx';
import SatellitePanel from './components/SatellitePanel.jsx';
import ExplorerPanel from './components/ExplorerPanel.jsx';

export const SUNLIT_NOTE = 'Flat horizon makes sunlit % about 50% at every site; terrain is not modelled.';

/** Build ISO timestamps for every sample of a site. */
export function generateTimestamps(site) {
  const t0 = new Date(site.start).getTime();
  const step = site.step_hours * 3600 * 1000;
  return site.sun_elev.map((_, i) => new Date(t0 + i * step).toISOString());
}

/** Index of the sample at (or just after) a YYYY-MM-DD date, clamped to the data. */
export function dateToIndex(site, dateStr) {
  const diff = new Date(dateStr + 'T00:00:00Z').getTime() - new Date(site.start).getTime();
  const idx = Math.round(diff / (site.step_hours * 3600 * 1000));
  return Math.max(0, Math.min(idx, site.sun_elev.length - 1));
}

/** Locate the longest dark run so it can be highlighted. */
function longestDarkBlock(sunElev, startIdx, end, stepHours) {
  let best = { start: startIdx, length: 0 }, s = -1;
  for (let i = startIdx; i <= end; i++) {
    const dark = i < end && sunElev[i] <= 0;
    if (dark && s < 0) s = i;
    if (!dark && s >= 0) {
      if (i - s > best.length) best = { start: s, length: i - s };
      s = -1;
    }
  }
  return { ...best, hours: best.length * stepHours };
}

export default function App() {
  const [data, setData] = useState(null);
  const [dataSourceName, setDataSourceName] = useState('');
  const [error, setError] = useState(null);
  const [siteId, setSiteId] = useState('');
  const [startDate, setStartDate] = useState('2026-01-01');
  const [windowDays, setWindowDays] = useState(30);
  const [maxDarkness, setMaxDarkness] = useState(100);
  const [compare, setCompare] = useState(false);
  const [explorerMode, setExplorerMode] = useState(false);

  // Satellite controls
  const [satAltitude, setSatAltitude] = useState(100);
  const [satStartAngle, setSatStartAngle] = useState(0);

  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/';
    (async () => {
      for (const [url, label] of [[`${base}data.json`, 'data.json (JPL Horizons)'], [`${base}fake_data.json`, 'fake_data.json (FAKE preview)']]) {
        try {
          const r = await fetch(url);
          if (!r.ok) continue;
          const json = await r.json();
          setData(json);
          setDataSourceName(label);
          setSiteId(json.sites[0]?.id ?? '');
          setStartDate(json.sites[0]?.start.slice(0, 10) ?? '2026-01-01');
          return;
        } catch { /* try next */ }
      }
      setError('Neither data.json nor fake_data.json could be loaded.');
    })();
  }, []);

  const site = data?.sites.find((s) => s.id === siteId) ?? data?.sites[0];

  const m = useMemo(() => {
    if (!site) return null;
    const stepsPerDay = Math.round(24 / site.step_hours);
    const startIdx = dateToIndex(site, startDate);
    const windowLen = windowDays * stepsPerDay;
    const end = Math.min(startIdx + windowLen, site.sun_elev.length);
    return {
      startIdx, windowLen, end,
      timestamps: generateTimestamps(site),
      sun: sunlitPercent(site.sun_elev, startIdx, windowLen),
      earth: earthVisiblePercent(site.earth_elev, startIdx, windowLen),
      both: bothAvailablePercent(site.sun_elev, site.earth_elev, startIdx, windowLen),
      dark: longestDarknessHours(site.sun_elev, site.step_hours, startIdx, windowLen),
      earthGap: longestEarthGapHours(site.earth_elev, site.step_hours, startIdx, windowLen),
      darkBlock: longestDarkBlock(site.sun_elev, startIdx, end, site.step_hours),
      countdown: hoursToNextSunsetOrEarthset(site.sun_elev, site.earth_elev, startIdx, site.step_hours),
      daily: perDayBothPercent(site.sun_elev, site.earth_elev, site.step_hours),
      dayIdx: Math.floor(startIdx / stepsPerDay),
    };
  }, [site, startDate, windowDays]);

  // Satellite simulation – runs synchronously for short windows (<=60d, <100ms)
  // and off the main thread in a Web Worker for longer windows (e.g. Whole Year, ~1.3s)
  // so clicking "Whole year" never freezes the UI.
  const [workerSatResult, setWorkerSatResult] = useState(null);
  const syncSatResult = useMemo(() => {
    if (!site || !m || windowDays > 60) return null;
    const simStartIso = m.timestamps[m.startIdx];
    const simEndIso = m.timestamps[Math.min(m.end, m.timestamps.length - 1)];
    return simulate(site, simStartIso, simEndIso, satAltitude, satStartAngle);
  }, [site, m, windowDays, satAltitude, satStartAngle]);

  useEffect(() => {
    if (!site || !m || windowDays <= 60) return;
    const simStartIso = m.timestamps[m.startIdx];
    const simEndIso = m.timestamps[Math.min(m.end, m.timestamps.length - 1)];
    let cancelled = false;
    try {
      const worker = new Worker(new URL('./satellite/satWorker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        if (!cancelled) setWorkerSatResult(e.data.result);
        worker.terminate();
      };
      worker.postMessage({ id: Date.now(), site, simStartIso, simEndIso, satAltitude, satStartAngle });
      return () => { cancelled = true; worker.terminate(); };
    } catch {
      // Fallback if Worker unavailable
      setWorkerSatResult(simulate(site, simStartIso, simEndIso, satAltitude, satStartAngle));
    }
  }, [site, m, windowDays, satAltitude, satStartAngle]);

  const satResult = windowDays > 60 ? workerSatResult : syncSatResult;

  // Compute total days in data for the "whole year" check
  const totalDataDays = useMemo(() => {
    if (!site) return 365;
    return Math.round((site.sun_elev.length - 1) * site.step_hours / 24);
  }, [site]);

  const isWholeYear = windowDays >= totalDataDays;

  const handleWholeYear = () => {
    if (!site) return;
    setStartDate(site.start.slice(0, 10));
    setWindowDays(totalDataDays);
  };

  if (error) {
    return (
      <div className="min-h-screen bg-[#090d16] text-red-400 flex items-center justify-center p-6">
        <div className="bg-red-950/40 border border-red-700/50 p-6 rounded-xl max-w-md text-center">
          <AlertTriangle className="w-10 h-10 mx-auto mb-2" />
          <h2 className="text-lg font-bold">Failed to load lunar data</h2>
          <p className="text-sm mt-1 text-gray-300">{error}</p>
        </div>
      </div>
    );
  }
  if (!data || !site || !m) {
    return (
      <div className="min-h-screen bg-[#090d16] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const dataStart = site.start.slice(0, 10);
  const dataEnd = m.timestamps[m.timestamps.length - 1].slice(0, 10);

  return (
    <div className="min-h-screen bg-[#090d16] text-gray-100 flex flex-col font-sans overflow-x-hidden">
      <header className="border-b border-gray-800 bg-[#0c1222]/80 backdrop-blur px-4 sm:px-6 py-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center text-yellow-400 font-bold">☾</div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-white">Lunar Landing Site Evaluator</h1>
              <p className="text-xs text-gray-400">Fast first screening: when are the Sun (power) and Earth (direct comms) above the horizon?</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:flex items-center gap-2 text-xs text-gray-400 font-mono bg-gray-900/60 px-3 py-1.5 rounded-md border border-gray-800">
              <Layers className="w-3.5 h-3.5" /> {dataSourceName}
            </span>
            <button onClick={() => setExplorerMode((e) => !e)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 min-h-[44px] sm:min-h-0 rounded-md border transition-colors ${explorerMode ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300' : 'border-gray-700 text-gray-300 hover:text-white'}`}>
              <Compass className="w-3.5 h-3.5" /> Explorer mode
            </button>
            <button onClick={() => setCompare((c) => !c)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 min-h-[44px] sm:min-h-0 rounded-md border transition-colors ${compare ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300' : 'border-gray-700 text-gray-300 hover:text-white'}`}>
              <Columns2 className="w-3.5 h-3.5" /> {compare ? 'Exit compare' : 'Compare'}
            </button>
          </div>
        </div>
        {!compare && (
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1 min-w-[220px]">
              <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Site</label>
              <select value={site.id} onChange={(e) => setSiteId(e.target.value)}
                className="bg-[#162038] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50">
                {data.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[260px]">
              <DateRangeControl startDate={startDate} setStartDate={setStartDate}
                windowDays={windowDays} setWindowDays={setWindowDays}
                minDate={dataStart} maxDate={dataEnd} />
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {compare ? (
          <CompareMode sites={data.sites} defaultDate={startDate} dataStart={dataStart} dataEnd={dataEnd} />
        ) : (
          <>
            {explorerMode && (
              <ExplorerPanel site={site} startDate={startDate} windowDays={windowDays} m={m} satResult={satResult} />
            )}

            {/* Row 1: gauges + viability */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-3 bg-[#10172a] border border-gray-800 rounded-xl p-5">
                <p className="text-xs text-gray-400 mb-4">
                  Window: {startDate} + {windowDays} days ({m.end - m.startIdx} samples at {site.step_hours} h)
                </p>
                <div className="flex flex-wrap justify-around gap-6">
                  <RingGauge value={m.earth} label="Earth visible" color="#4169E1" />
                  <RingGauge value={m.both} label="Both up (Sun AND Earth)" color="#10b981" />
                  <RingGauge value={m.sun} label="Sunlit" color="#FFD700" note={SUNLIT_NOTE} />
                </div>
              </div>
              <ViabilityIndicator bothPercent={m.both} longestDarkness={m.dark}
                maxDarknessHours={maxDarkness} setMaxDarknessHours={setMaxDarkness} />
            </div>

            {/* Row 2: timeline + cards */}
            <div className="bg-[#10172a] border border-gray-800 rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-semibold text-white">Timeline over the window</h2>
              <TimelineStrip sunElev={site.sun_elev} earthElev={site.earth_elev}
                startIdx={m.startIdx} windowLen={m.windowLen} darkBlock={m.darkBlock}
                satResult={satResult} site={site} />
              <MetricCards longestDarkness={m.dark} longestEarthGap={m.earthGap} countdown={m.countdown} />
            </div>

            <ElevationChart site={site} timestamps={m.timestamps} startIdx={m.startIdx} endIdx={m.end} />

            <PolarSkyView site={site} timestamps={m.timestamps} startIdx={m.startIdx} endIdx={m.end}
              satResult={satResult}
              satAltitude={satAltitude} setSatAltitude={setSatAltitude}
              satStartAngle={satStartAngle} setSatStartAngle={setSatStartAngle} />

            {/* Satellite panel */}
            <SatellitePanel
              altitudeKm={satAltitude} setAltitudeKm={setSatAltitude}
              startAngle={satStartAngle} setStartAngle={setSatStartAngle}
              satResult={satResult}
              onWholeYear={handleWholeYear}
              isWholeYear={isWholeYear} />

            <LaunchSlipCalendar dailyBothPercent={m.daily} dataStartIso={site.start}
              selectedDayIdx={m.dayIdx} windowDays={windowDays} onDayClick={setStartDate} />

            <SiteCard site={site} />
          </>
        )}
      </main>

      <LimitsFooter />
    </div>
  );
}
