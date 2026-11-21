import React, { useState, useMemo } from 'react';
import {
  sunlitPercent,
  earthVisiblePercent,
  bothAvailablePercent,
  longestDarknessHours,
  longestEarthGapHours,
  hoursToNextSunsetOrEarthset,
} from '../metrics/metrics.js';
import RingGauge from './RingGauge.jsx';
import MetricCards from './MetricCards.jsx';
import TimelineStrip from './TimelineStrip.jsx';

const SUNLIT_NOTE = 'Flat horizon: sunlit ≈ 50% everywhere.';

function dateToIndex(site, dateStr) {
  const diff = new Date(dateStr + 'T00:00:00Z').getTime() - new Date(site.start).getTime();
  return Math.max(0, Math.min(Math.round(diff / (site.step_hours * 3600 * 1000)), site.sun_elev.length - 1));
}

function computePanel(site, dateStr, winDays) {
  if (!site) return null;
  const startIdx = dateToIndex(site, dateStr);
  const windowLen = Math.round((winDays * 24) / site.step_hours);
  return {
    site, startIdx, windowLen,
    sun: sunlitPercent(site.sun_elev, startIdx, windowLen),
    earth: earthVisiblePercent(site.earth_elev, startIdx, windowLen),
    both: bothAvailablePercent(site.sun_elev, site.earth_elev, startIdx, windowLen),
    dark: longestDarknessHours(site.sun_elev, site.step_hours, startIdx, windowLen),
    earthGap: longestEarthGapHours(site.earth_elev, site.step_hours, startIdx, windowLen),
    countdown: hoursToNextSunsetOrEarthset(site.sun_elev, site.earth_elev, startIdx, site.step_hours),
  };
}

/**
 * CompareMode – two sites (same date) or two dates (same site), side by side,
 * using the same gauges, timeline and cards as the main dashboard.
 */
export default function CompareMode({ sites, defaultDate, dataStart, dataEnd }) {
  const [mode, setMode] = useState('sites');
  const [siteIdA, setSiteIdA] = useState(sites[0]?.id || '');
  const [siteIdB, setSiteIdB] = useState(sites[2]?.id || sites[0]?.id || '');
  const [dateA, setDateA] = useState(defaultDate || dataStart);
  const [dateB, setDateB] = useState(dataStart ? new Date(new Date(dataStart).getTime() + 90 * 86400000).toISOString().slice(0, 10) : dataStart);
  const [windowDays, setWindowDays] = useState(30);

  const byId = (id) => sites.find((s) => s.id === id);
  const panelA = useMemo(() => computePanel(byId(siteIdA), dateA, windowDays), [siteIdA, dateA, windowDays, sites]);
  const panelB = useMemo(
    () => (mode === 'sites' ? computePanel(byId(siteIdB), dateA, windowDays) : computePanel(byId(siteIdA), dateB, windowDays)),
    [mode, siteIdA, siteIdB, dateA, dateB, windowDays, sites],
  );

  const sel = 'bg-[#162038] border border-gray-700 rounded px-2 py-1.5 text-sm text-white';
  const siteSelect = (v, set, label) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-400">{label}</label>
      <select value={v} onChange={(e) => set(e.target.value)} className={sel}>
        {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </div>
  );
  const dateInput = (v, set, label) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-400">{label}</label>
      <input type="date" value={v} min={dataStart} max={dataEnd} onChange={(e) => e.target.value && set(e.target.value)} className={sel} />
    </div>
  );

  const renderPanel = (p, label) => {
    if (!p) return <div className="text-gray-500 text-sm">No data</div>;
    return (
      <div className="space-y-4 flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-white border-b border-gray-800 pb-2">{label}</h3>
        <div className="flex flex-wrap justify-center gap-4">
          <RingGauge value={p.earth} label="Earth visible" color="#4169E1" size={100} />
          <RingGauge value={p.both} label="Both up" color="#10b981" size={100} />
          <RingGauge value={p.sun} label="Sunlit" color="#FFD700" size={100} note={SUNLIT_NOTE} />
        </div>
        <TimelineStrip sunElev={p.site.sun_elev} earthElev={p.site.earth_elev} startIdx={p.startIdx} windowLen={p.windowLen} />
        <MetricCards longestDarkness={p.dark} longestEarthGap={p.earthGap} countdown={p.countdown} />
      </div>
    );
  };

  return (
    <div className="bg-[#10172a] border border-gray-800 rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <h2 className="text-sm font-semibold text-white">Compare</h2>
        <div className="flex gap-1 bg-[#0d1424] rounded-lg p-0.5 border border-gray-800">
          {[['sites', 'Two sites'], ['dates', 'Two dates']].map(([k, t]) => (
            <button key={k} onClick={() => setMode(k)}
              className={`px-3 py-1 text-xs rounded-md ${mode === k ? 'bg-yellow-500/20 text-yellow-400' : 'text-gray-400 hover:text-white'}`}>{t}</button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-4 items-end">
        {mode === 'sites' ? (
          <>{siteSelect(siteIdA, setSiteIdA, 'Site A')}{siteSelect(siteIdB, setSiteIdB, 'Site B')}{dateInput(dateA, setDateA, 'Date')}</>
        ) : (
          <>{siteSelect(siteIdA, setSiteIdA, 'Site')}{dateInput(dateA, setDateA, 'Date A')}{dateInput(dateB, setDateB, 'Date B')}</>
        )}
        <div className="flex flex-col gap-1 flex-1 min-w-[140px]">
          <label className="text-xs text-gray-400">Window: {windowDays} days</label>
          <input type="range" min={1} max={365} value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))} className="w-full accent-yellow-500" />
        </div>
      </div>
      <div className="flex flex-col md:flex-row gap-6">
        {renderPanel(panelA, mode === 'sites' ? `A: ${panelA?.site.name} (${dateA})` : `A: ${dateA} (${panelA?.site.name})`)}
        <div className="hidden md:block w-px bg-gray-700/50" />
        {renderPanel(panelB, mode === 'sites' ? `B: ${panelB?.site.name} (${dateA})` : `B: ${dateB} (${panelB?.site.name})`)}
      </div>
    </div>
  );
}
