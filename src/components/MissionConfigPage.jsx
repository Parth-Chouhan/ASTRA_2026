import React, { useState, useEffect, useMemo } from 'react';
import MissionCalendar from './MissionCalendar.jsx';
import {
  sunlitPercent,
  earthVisiblePercent,
  bothAvailablePercent,
  longestDarknessHours,
  longestEarthGapHours,
} from '../metrics/metrics.js';

/**
 * MissionConfigPage — The 2nd page after the Landing Page.
 *
 * Flow:
 *   1. User picks a landing site (or enters custom lat/lon)
 *   2. User picks a LAUNCH date (from Earth)
 *   3. System auto-computes transit time and LANDING date
 *   4. User picks mission duration on the Moon
 *   5. System runs feasibility analysis on the data
 *   6. Shows GO / NO-GO verdict with detailed breakdown
 *   7. If feasible → "Launch Simulator" takes them to the 3D sim + dashboard
 */

// ── Transit time profiles (Earth → Moon) ──
// Real missions take different durations depending on trajectory
const TRANSIT_PROFILES = [
  { id: 'direct', name: 'Direct Transfer (Apollo-style)', days: 3, desc: '~3 days — Fast direct trajectory like Apollo missions. Uses more fuel.' },
  { id: 'standard', name: 'Standard Hohmann Transfer', days: 5, desc: '~5 days — Standard energy-efficient transfer orbit.' },
  { id: 'lowenergy', name: 'Low-Energy Transfer (Chandrayaan-style)', days: 42, desc: '~42 days — Fuel-efficient trajectory with multiple Earth orbits before TLI, like Chandrayaan-3.' },
];

const MOON_FACTS = [
  'The Moon is ~384,400 km from Earth on average.',
  'Apollo 11 took 3 days, 3 hours, 49 minutes to reach lunar orbit.',
  'Chandrayaan-3 took 42 days using a low-energy transfer orbit.',
  'A lunar day (synodic month) lasts ~29.5 Earth days.',
  'Surface temperature ranges from -173°C (night) to +127°C (day).',
  'The Moon has no atmosphere — no parachute-assisted landing possible.',
];

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(d1, d2) {
  return Math.round((new Date(d2 + 'T00:00:00Z') - new Date(d1 + 'T00:00:00Z')) / (86400 * 1000));
}

function dateToIndex(site, dateStr) {
  const diff = new Date(dateStr + 'T00:00:00Z').getTime() - new Date(site.start).getTime();
  const idx = Math.round(diff / (site.step_hours * 3600 * 1000));
  return Math.max(0, Math.min(idx, site.sun_elev.length - 1));
}

export default function MissionConfigPage({
  data,
  initialStep = 1,
  initialConfig = null,
  onLaunch,
  onBack,
}) {
  // ── State ──
  const [step, setStep] = useState(initialStep); // 1=location, 2=dates, 3=results
  const [siteId, setSiteId] = useState(initialConfig?.siteId ?? data?.sites[0]?.id ?? '');
  const [transitProfile, setTransitProfile] = useState(initialConfig?.transitProfile ?? 'direct');
  const [launchDate, setLaunchDate] = useState(initialConfig?.launchDate ?? '2026-03-15');
  const [missionDays, setMissionDays] = useState(initialConfig?.windowDays ?? initialConfig?.missionDays ?? 14);
  const [factIdx, setFactIdx] = useState(0);
  const [animateIn, setAnimateIn] = useState(true);

  // Cycle moon facts
  useEffect(() => {
    const iv = setInterval(() => setFactIdx(i => (i + 1) % MOON_FACTS.length), 6000);
    return () => clearInterval(iv);
  }, []);

  // Animate step transitions
  useEffect(() => {
    setAnimateIn(true);
    const t = setTimeout(() => setAnimateIn(false), 600);
    return () => clearTimeout(t);
  }, [step]);

  const site = data?.sites.find(s => s.id === siteId) ?? data?.sites[0];
  const transit = TRANSIT_PROFILES.find(p => p.id === transitProfile) ?? TRANSIT_PROFILES[0];
  const landingDate = addDays(launchDate, transit.days);
  const missionEndDate = addDays(landingDate, missionDays);

  // Data bounds
  const dataStart = site?.start?.slice(0, 10) ?? '2026-01-01';
  const dataEnd = site ? new Date(new Date(site.start).getTime() + (site.sun_elev.length - 1) * site.step_hours * 3600 * 1000).toISOString().slice(0, 10) : '2026-12-31';

  // ── Feasibility Analysis ──
  const analysis = useMemo(() => {
    if (!site) return null;

    const landingIdx = dateToIndex(site, landingDate);
    const stepsPerDay = Math.round(24 / site.step_hours);
    const windowLen = missionDays * stepsPerDay;
    const end = Math.min(landingIdx + windowLen, site.sun_elev.length);
    const actualLen = end - landingIdx;

    if (actualLen <= 0) {
      return { feasible: false, reason: 'Landing date is outside the available data range.', details: null };
    }

    const sunPct = sunlitPercent(site.sun_elev, landingIdx, actualLen);
    const earthPct = earthVisiblePercent(site.earth_elev, landingIdx, actualLen);
    const bothPct = bothAvailablePercent(site.sun_elev, site.earth_elev, landingIdx, actualLen);
    const darkHrs = longestDarknessHours(site.sun_elev, site.step_hours, landingIdx, actualLen);
    const earthGapHrs = longestEarthGapHours(site.earth_elev, site.step_hours, landingIdx, actualLen);

    // Check if landing happens during sunlight (safe landing)
    const landingSunElev = site.sun_elev[landingIdx];
    const landingEarthElev = site.earth_elev[landingIdx];
    const sunAtLanding = typeof landingSunElev === 'number' && landingSunElev > 0;
    const earthAtLanding = typeof landingEarthElev === 'number' && landingEarthElev > 0;

    // Feasibility checks
    const checks = [
      {
        label: 'Sun above horizon at landing',
        pass: sunAtLanding,
        value: sunAtLanding
          ? `Yes (${landingSunElev.toFixed(1)}° elevation)`
          : `No (${typeof landingSunElev === 'number' ? landingSunElev.toFixed(1) + '°' : 'N/A'}) — LANDING IN DARKNESS`,
        critical: true,
        tip: 'Landing in darkness is extremely risky — no visual guidance, no solar power for initial deployment.',
      },
      {
        label: 'Earth visible at landing (direct comms)',
        pass: earthAtLanding,
        value: earthAtLanding
          ? `Yes (${landingEarthElev.toFixed(1)}° elevation)`
          : `No (${typeof landingEarthElev === 'number' ? landingEarthElev.toFixed(1) + '°' : 'N/A'}) — NO DIRECT COMMS`,
        critical: true,
        tip: 'Without Earth line-of-sight, real-time telemetry and abort commands are impossible during descent.',
      },
      {
        label: 'Sunlit time during mission',
        pass: sunPct >= 40,
        value: `${sunPct.toFixed(1)}% of mission window`,
        critical: false,
        tip: 'Solar panels need sunlight for power. Below 40% means extended battery-only operation.',
      },
      {
        label: 'Earth visibility during mission',
        pass: earthPct >= 30,
        value: `${earthPct.toFixed(1)}% of mission window`,
        critical: false,
        tip: 'Communication with Earth for data relay and commanding.',
      },
      {
        label: 'Sun + Earth both available',
        pass: bothPct >= 20,
        value: `${bothPct.toFixed(1)}% of mission window`,
        critical: false,
        tip: 'Simultaneous power + comms is ideal for active science operations.',
      },
      {
        label: 'Longest continuous darkness',
        pass: darkHrs <= 200,
        value: `${darkHrs.toFixed(0)} hours`,
        critical: darkHrs > 350,
        tip: darkHrs > 200
          ? 'Batteries typically can\'t sustain the lander beyond 200 hours of darkness.'
          : 'Within typical battery survival limits.',
      },
      {
        label: 'Longest Earth comm gap',
        pass: earthGapHrs <= 200,
        value: `${earthGapHrs.toFixed(0)} hours`,
        critical: false,
        tip: 'Long comm gaps mean autonomous operation. Relay satellites can mitigate this.',
      },
    ];

    const criticalFails = checks.filter(c => c.critical && !c.pass);
    const warnings = checks.filter(c => !c.critical && !c.pass);
    const allCriticalPass = criticalFails.length === 0;
    const feasible = allCriticalPass && warnings.length <= 2;

    return {
      feasible,
      verdict: feasible ? 'GO' : allCriticalPass ? 'CONDITIONAL' : 'NO-GO',
      checks,
      criticalFails,
      warnings,
      summary: {
        sunPct, earthPct, bothPct, darkHrs, earthGapHrs,
        sunAtLanding, earthAtLanding,
        landingSunElev, landingEarthElev,
      },
      startIdx: landingIdx,
      windowLen: actualLen,
    };
  }, [site, landingDate, missionDays]);

  // ── Handlers ──
  const handleProceed = () => {
    if (!analysis) return;
    // Pass config to App.jsx
    onLaunch({
      siteId,
      startDate: landingDate,
      windowDays: missionDays,
      launchDate,
      transitDays: transit.days,
      transitProfile: transit.id,
      landingSunElev: analysis.summary.landingSunElev,
      landingEarthElev: analysis.summary.landingEarthElev,
    });
  };

  if (!data || !site) {
    return (
      <div className="min-h-screen bg-[#04080f] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#04080f] text-gray-100 overflow-x-hidden relative">
      {/* Ambient glows */}
      <div className="fixed top-[-200px] left-[-100px] w-[500px] h-[500px] rounded-full pointer-events-none z-0"
        style={{ background: 'radial-gradient(circle, rgba(74,158,255,0.05) 0%, transparent 70%)' }} />
      <div className="fixed bottom-[-200px] right-[-100px] w-[600px] h-[600px] rounded-full pointer-events-none z-0"
        style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.04) 0%, transparent 70%)' }} />

      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(24px) } to { opacity:1; transform:translateY(0) } }
        @keyframes slideIn { from { opacity:0; transform:translateX(-30px) } to { opacity:1; transform:translateX(0) } }
        @keyframes pulseGlow { 0%,100% { box-shadow: 0 0 20px rgba(16,185,129,0.15) } 50% { box-shadow: 0 0 40px rgba(16,185,129,0.3) } }
        .fade-up { animation: fadeUp 0.6s ease-out both }
        .slide-in { animation: slideIn 0.5s ease-out both }
      `}</style>

      {/* ── NAV ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 sm:px-10 py-4 bg-[#04080fcc] backdrop-blur-xl border-b border-blue-500/10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (step > 1) {
                setStep(s => s - 1);
              } else {
                onBack();
              }
            }}
            className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-1 cursor-pointer"
          >
            ← Back
          </button>
          <div className="w-px h-5 bg-gray-700" />
          <h1 className="text-lg font-semibold tracking-[4px] text-white" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
            MISSION CONFIG
          </h1>
          <span className="text-[9px] px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 tracking-wider">STEP {step}/3</span>
        </div>

        {/* Step indicators */}
        <div className="hidden sm:flex items-center gap-2">
          {[
            { n: 1, label: 'Location' },
            { n: 2, label: 'Dates' },
            { n: 3, label: 'Analysis' },
          ].map((s, i) => (
            <React.Fragment key={s.n}>
              {i > 0 && <div className={`w-8 h-px ${step >= s.n ? 'bg-blue-500/60' : 'bg-gray-700'}`} />}
              <button
                onClick={() => s.n <= step && setStep(s.n)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs tracking-wider transition-all cursor-pointer
                  ${step === s.n
                    ? 'bg-blue-500/15 border border-blue-500/40 text-blue-300'
                    : step > s.n
                      ? 'border border-blue-500/20 text-blue-400/60 hover:text-blue-300'
                      : 'border border-gray-800 text-gray-600'}`}
              >
                <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold
                  ${step === s.n ? 'bg-blue-500/30 text-blue-200' : step > s.n ? 'bg-blue-500/10 text-blue-400' : 'bg-gray-800 text-gray-600'}`}>
                  {step > s.n ? '✓' : s.n}
                </span>
                {s.label}
              </button>
            </React.Fragment>
          ))}
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 pt-24 pb-16 relative z-10">

        {/* ══════════════════════════════════════════════════
            STEP 1: SELECT LANDING SITE
           ══════════════════════════════════════════════════ */}
        {step === 1 && (
          <div className={animateIn ? 'fade-up' : ''}>
            <p className="text-[10px] tracking-[3px] uppercase text-blue-400 mb-3">Step 1</p>
            <h2 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
              Select Landing Site
            </h2>
            <p className="text-sm text-gray-400 mb-8 max-w-lg">
              Choose where on the Moon you want to land. Each site has different lighting and communication characteristics.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              {data.sites.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSiteId(s.id)}
                  className={`text-left p-5 rounded-xl border transition-all cursor-pointer group
                    ${siteId === s.id
                      ? 'bg-blue-500/10 border-blue-500/40 shadow-[0_0_25px_rgba(74,158,255,0.1)]'
                      : 'bg-[#0a1628]/60 border-gray-800 hover:border-blue-500/25 hover:-translate-y-0.5'}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0
                      ${siteId === s.id ? 'bg-blue-500/20 border border-blue-500/30' : 'bg-gray-800/50 border border-gray-700'}`}>
                      🌙
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-white truncate">{s.name || s.full_name}</h3>
                      <p className="text-xs text-gray-400 mt-1">
                        {s.latitude?.toFixed(2)}°{s.latitude >= 0 ? 'N' : 'S'}, {s.longitude?.toFixed(2)}°E
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="text-[9px] px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-400">
                          {s.category?.replace(/_/g, ' ')}
                        </span>
                        {Math.abs(s.latitude) > 80 && (
                          <span className="text-[9px] px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                            Polar region
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-1
                      ${siteId === s.id ? 'border-blue-400 bg-blue-500' : 'border-gray-600'}`}>
                      {siteId === s.id && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Moon fact ticker */}
            <div className="bg-[#0a1628]/40 border border-blue-500/10 rounded-lg px-5 py-3 mb-8">
              <p className="text-[10px] tracking-wider uppercase text-blue-400/60 mb-1">Did you know?</p>
              <p className="text-xs text-gray-300 transition-all duration-500">{MOON_FACTS[factIdx]}</p>
            </div>

            <button
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl cursor-pointer
                bg-gradient-to-br from-blue-600 to-blue-500 text-white font-medium text-sm tracking-wide
                shadow-[0_4px_25px_rgba(26,138,255,0.3)] hover:shadow-[0_8px_35px_rgba(26,138,255,0.4)]
                hover:-translate-y-0.5 transition-all"
            >
              Continue to Dates →
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            STEP 2: CONFIGURE DATES
           ══════════════════════════════════════════════════ */}
        {step === 2 && (
          <div className={animateIn ? 'fade-up' : ''}>
            <p className="text-[10px] tracking-[3px] uppercase text-blue-400 mb-3">Step 2</p>
            <h2 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
              Configure Launch & Landing Dates
            </h2>
            <p className="text-sm text-gray-400 mb-8 max-w-xl">
              Pick your <strong className="text-blue-300">launch date from Earth</strong>. The landing date is automatically
              calculated based on the transfer orbit you choose. The Moon is ~384,400 km away!
            </p>

            {/* Transfer orbit selection */}
            <div className="mb-8">
              <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-3 block">
                🛸 Transfer Orbit Type
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {TRANSIT_PROFILES.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setTransitProfile(p.id)}
                    className={`text-left p-4 rounded-xl border transition-all cursor-pointer
                      ${transitProfile === p.id
                        ? 'bg-blue-500/10 border-blue-500/40'
                        : 'bg-[#0a1628]/60 border-gray-800 hover:border-blue-500/25'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-white">{p.name.split('(')[0].trim()}</span>
                      <span className={`text-lg font-bold ${transitProfile === p.id ? 'text-blue-300' : 'text-gray-400'}`}>
                        {p.days}d
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed">{p.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive Flight Calendar */}
            <div className="mb-8">
              <MissionCalendar
                site={site}
                launchDate={launchDate}
                onSelectLaunchDate={setLaunchDate}
                transitDays={transit.days}
                landingDate={landingDate}
                missionDays={missionDays}
                missionEndDate={missionEndDate}
                dataStart={dataStart}
                dataEnd={dataEnd}
              />
            </div>

            {/* Mission duration */}
            <div className="bg-[#0a1628]/70 border border-amber-500/15 rounded-xl p-5 mb-8">
              <label className="text-xs text-amber-400 uppercase tracking-wider font-semibold mb-1 block">
                ⏱ Mission Duration on the Moon
              </label>
              <p className="text-[10px] text-gray-500 mb-3">
                How many days should the lander operate on the surface? (1 lunar day ≈ 29.5 Earth days)
              </p>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={1}
                  max={180}
                  value={missionDays}
                  onChange={e => setMissionDays(Number(e.target.value))}
                  className="flex-1 accent-amber-500 cursor-pointer"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={missionDays}
                    onChange={e => setMissionDays(Math.max(1, Math.min(365, Number(e.target.value))))}
                    className="w-20 bg-[#162038] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white text-center
                      focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                  <span className="text-sm text-gray-400">days</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {[7, 14, 30, 60, 90, 180].map(d => (
                  <button
                    key={d}
                    onClick={() => setMissionDays(d)}
                    className={`text-[10px] px-3 py-1 rounded-lg border cursor-pointer transition-all
                      ${missionDays === d
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                        : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-300'}`}
                  >
                    {d} days {d === 30 ? '(~1 lunar day)' : d === 180 ? '(6 months)' : ''}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-500 mt-3">
                Mission ends: <span className="text-gray-300 font-mono">{missionEndDate}</span>
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl cursor-pointer
                  bg-white/[0.03] border border-white/10 text-gray-300 text-sm
                  hover:bg-white/[0.06] hover:border-white/20 transition-all"
              >
                ← Back
              </button>
              <button
                onClick={() => setStep(3)}
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl cursor-pointer
                  bg-gradient-to-br from-blue-600 to-blue-500 text-white font-medium text-sm tracking-wide
                  shadow-[0_4px_25px_rgba(26,138,255,0.3)] hover:shadow-[0_8px_35px_rgba(26,138,255,0.4)]
                  hover:-translate-y-0.5 transition-all"
              >
                Analyze Feasibility →
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            STEP 3: FEASIBILITY ANALYSIS
           ══════════════════════════════════════════════════ */}
        {step === 3 && analysis && (
          <div className={animateIn ? 'fade-up' : ''}>
            <p className="text-[10px] tracking-[3px] uppercase text-blue-400 mb-3">Step 3</p>
            <h2 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
              Feasibility Analysis
            </h2>
            <p className="text-sm text-gray-400 mb-6 max-w-xl">
              Based on JPL Horizons ephemeris data for <strong className="text-white">{site.name || site.full_name}</strong>,
              landing on <strong className="text-emerald-300">{landingDate}</strong> with a {missionDays}-day mission.
            </p>

            {/* BIG VERDICT */}
            <div className={`rounded-2xl p-8 mb-8 text-center border-2 transition-all ${
              analysis.verdict === 'GO'
                ? 'bg-emerald-500/8 border-emerald-500/30'
                : analysis.verdict === 'CONDITIONAL'
                  ? 'bg-amber-500/8 border-amber-500/30'
                  : 'bg-red-500/8 border-red-500/30'
            }`} style={analysis.verdict === 'GO' ? { animation: 'pulseGlow 3s ease-in-out infinite' } : {}}>
              <div className={`text-6xl font-black tracking-[8px] mb-3 ${
                analysis.verdict === 'GO'
                  ? 'text-emerald-400'
                  : analysis.verdict === 'CONDITIONAL'
                    ? 'text-amber-400'
                    : 'text-red-400'
              }`} style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
                {analysis.verdict}
              </div>
              <p className={`text-sm ${
                analysis.verdict === 'GO'
                  ? 'text-emerald-300'
                  : analysis.verdict === 'CONDITIONAL'
                    ? 'text-amber-300'
                    : 'text-red-300'
              }`}>
                {analysis.verdict === 'GO'
                  ? '✅ All critical checks passed. This launch window is feasible!'
                  : analysis.verdict === 'CONDITIONAL'
                    ? '⚠️ Critical checks pass but some conditions are marginal. Proceed with caution.'
                    : '❌ Critical checks failed. This launch window is NOT recommended.'}
              </p>
            </div>

            {/* Checklist */}
            <div className="bg-[#0a1628]/70 border border-gray-800 rounded-xl p-6 mb-6">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <span className="w-5 h-5 rounded bg-blue-500/15 flex items-center justify-center text-xs">📋</span>
                Feasibility Checklist
              </h3>
              <div className="space-y-3">
                {analysis.checks.map((c, i) => (
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border transition-all
                    ${c.pass
                      ? 'bg-emerald-500/5 border-emerald-500/15'
                      : c.critical
                        ? 'bg-red-500/8 border-red-500/25'
                        : 'bg-amber-500/5 border-amber-500/15'}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-sm
                      ${c.pass ? 'bg-emerald-500/20 text-emerald-400' : c.critical ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                      {c.pass ? '✓' : c.critical ? '✕' : '!'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-white font-medium">{c.label}</span>
                        <span className={`text-xs font-mono ${c.pass ? 'text-emerald-300' : c.critical ? 'text-red-300' : 'text-amber-300'}`}>
                          {c.value}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-1">{c.tip}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              <StatCard label="Sunlit" value={`${analysis.summary.sunPct.toFixed(0)}%`} icon="☀️" />
              <StatCard label="Earth Visible" value={`${analysis.summary.earthPct.toFixed(0)}%`} icon="🌍" />
              <StatCard label="Max Darkness" value={`${analysis.summary.darkHrs.toFixed(0)}h`} icon="🌑" />
              <StatCard label="Max Comm Gap" value={`${analysis.summary.earthGapHrs.toFixed(0)}h`} icon="📡" />
            </div>

            {/* Mission recap */}
            <div className="bg-[#0a1628]/40 border border-blue-500/10 rounded-xl p-5 mb-8">
              <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-3">Mission Recap</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                <div><span className="text-gray-500">Site:</span> <span className="text-white ml-1">{site.name || site.full_name}</span></div>
                <div><span className="text-gray-500">Coordinates:</span> <span className="text-white ml-1">{site.latitude?.toFixed(2)}°, {site.longitude?.toFixed(2)}°E</span></div>
                <div><span className="text-gray-500">Launch:</span> <span className="text-blue-300 ml-1">{launchDate}</span></div>
                <div><span className="text-gray-500">Transit:</span> <span className="text-white ml-1">{transit.days} days ({transit.id})</span></div>
                <div><span className="text-gray-500">Landing:</span> <span className="text-emerald-300 ml-1">{landingDate}</span></div>
                <div><span className="text-gray-500">Duration:</span> <span className="text-amber-300 ml-1">{missionDays} days</span></div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl cursor-pointer
                  bg-white/[0.03] border border-white/10 text-gray-300 text-sm
                  hover:bg-white/[0.06] hover:border-white/20 transition-all"
              >
                ← Adjust Dates
              </button>

              <button
                onClick={handleProceed}
                className={`inline-flex items-center gap-2.5 px-8 py-3.5 rounded-xl cursor-pointer font-medium text-sm tracking-wide
                  transition-all hover:-translate-y-0.5 ${
                    analysis.verdict === 'NO-GO'
                      ? 'bg-gradient-to-br from-red-600/20 to-red-500/10 border border-red-500/30 text-red-300 shadow-[0_4px_15px_rgba(255,50,50,0.15)]'
                      : analysis.verdict === 'CONDITIONAL'
                        ? 'bg-gradient-to-br from-amber-600 to-amber-500 text-white shadow-[0_4px_25px_rgba(245,158,11,0.3)] hover:shadow-[0_8px_35px_rgba(245,158,11,0.4)]'
                        : 'bg-gradient-to-br from-emerald-600 to-emerald-500 text-white shadow-[0_4px_25px_rgba(16,185,129,0.3)] hover:shadow-[0_8px_35px_rgba(16,185,129,0.4)]'
                  }`}
              >
                <span className="text-lg">🚀</span>
                {analysis.verdict === 'NO-GO'
                  ? 'Proceed Anyway (Not Recommended)'
                  : analysis.verdict === 'CONDITIONAL'
                    ? 'Proceed with Caution'
                    : 'Launch Simulator!'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="relative z-10 text-center py-6 border-t border-blue-500/8 text-xs text-gray-600">
        ASTRA 2026 · Ephemeris data from JPL Horizons · Educational purposes only
      </footer>
    </div>
  );
}

// ── Sub-components ──

function TimelineBlock({ icon, label, date, color }) {
  const colorMap = {
    blue: 'border-blue-500/30 bg-blue-500/8 text-blue-300',
    emerald: 'border-emerald-500/30 bg-emerald-500/8 text-emerald-300',
    amber: 'border-amber-500/30 bg-amber-500/8 text-amber-300',
  };
  return (
    <div className={`flex flex-col items-center px-4 py-3 rounded-xl border ${colorMap[color]} shrink-0`}>
      <span className="text-xl mb-1">{icon}</span>
      <span className="text-[10px] uppercase tracking-wider font-semibold">{label}</span>
      <span className="text-xs font-mono mt-0.5 text-white">{date}</span>
    </div>
  );
}

function TimelineArrow({ label }) {
  return (
    <div className="flex flex-col items-center px-3 shrink-0">
      <div className="w-12 h-px bg-gray-600 relative">
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-l-[5px] border-l-gray-600 border-y-[3px] border-y-transparent" />
      </div>
      <span className="text-[9px] text-gray-500 mt-1 whitespace-nowrap">{label}</span>
    </div>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <div className="bg-[#0a1628]/70 border border-gray-800 rounded-xl p-4 text-center">
      <span className="text-xl">{icon}</span>
      <div className="text-lg font-bold text-white mt-1" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
        {value}
      </div>
      <div className="text-[10px] text-gray-500 tracking-wider uppercase mt-0.5">{label}</div>
    </div>
  );
}
