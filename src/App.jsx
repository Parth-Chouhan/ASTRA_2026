import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import LanderSimulation3D from './components/LanderSimulation3D.jsx';
import LandingPage from './components/LandingPage.jsx';
import MissionConfigPage from './components/MissionConfigPage.jsx';

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
  const [showLanding, setShowLanding] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [configStep, setConfigStep] = useState(1);
  const [missionConfig, setMissionConfig] = useState(null);
  const [data, setData] = useState(null);
  const [dataSourceName, setDataSourceName] = useState('');
  const [error, setError] = useState(null);
  const [siteId, setSiteId] = useState('');

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
          return;
        } catch { /* try next */ }
      }
      setError('Neither data.json nor fake_data.json could be loaded.');
    })();
  }, []);

  const site = data?.sites.find((s) => s.id === siteId) ?? data?.sites[0];

  // ── Page Flow: Landing → Config → Full-Screen Simulator ──
  if (showLanding) {
    return <LandingPage onEnter={() => { setShowLanding(false); setShowConfig(true); }} />;
  }

  if (showConfig) {
    if (!data) {
      return (
        <div className="min-h-screen bg-[#090d16] flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }
    return (
      <MissionConfigPage
        data={data}
        initialStep={configStep}
        initialConfig={missionConfig}
        onBack={() => { setShowConfig(false); setShowLanding(true); setConfigStep(1); }}
        onLaunch={(config) => {
          setMissionConfig(config);
          setSiteId(config.siteId);
          setShowConfig(false);
        }}
      />
    );
  }

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

  // The site must exist for the sim to work
  if (!data || !site) {
    return (
      <div className="min-h-screen bg-[#090d16] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Full-Screen Simulator ──
  return (
    <LanderSimulation3D
      heightClass="h-screen"
      siteLat={site?.latitude ?? site?.lat}
      siteLon={site?.longitude ?? site?.lon}
      siteName={site?.name || site?.full_name}
      missionConfig={missionConfig}
      siteData={site}
      onBack={() => {
        setShowConfig(true);
        setConfigStep(2); // Return to Step 2 (Dates & Mission Calendar)
      }}
    />
  );
}
