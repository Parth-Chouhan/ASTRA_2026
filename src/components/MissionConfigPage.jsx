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
 * MissionConfigPage — 2-step mission planner.
 *
 * Flow:
 *   1. User configures Fuel / Transfer Mode, Launch Date (from Earth), and Mission Duration.
 *      (Upfront location selection is hidden — the engine evaluates all 4 sites automatically.)
 *   2. System evaluates all candidate landing sites against JPL Horizons ephemeris data,
 *      ranks them by preference, and displays Green (GO), Yellow (CONDITIONAL), or
 *      Red (NO-GO) status for every site — plus a prominent Red warning if no viable
 *      landing option exists for the chosen window.
 *   3. User selects from the recommended sites and launches the 3D simulator.
 */

// ── Fuel / Transfer Mode profiles (Earth → Moon) ──
const FUEL_MODES = [
  {
    id: 'direct',
    name: 'Direct Transfer',
    fuelTag: 'High Fuel',
    days: 3,
    desc: '~3 days — Fast Apollo-style direct trajectory. Highest propellant usage, shortest transit.',
  },
  {
    id: 'standard',
    name: 'Standard Hohmann',
    fuelTag: 'Balanced Fuel',
    days: 5,
    desc: '~5 days — Balanced energy-efficient transfer orbit with moderate fuel consumption.',
  },
  {
    id: 'lowenergy',
    name: 'Low-Energy Transfer',
    fuelTag: 'Fuel Saver',
    days: 42,
    desc: '~42 days — Chandrayaan-style multi-orbit transfer. Lowest fuel usage, longest transit.',
  },
];

const MOON_FACTS = [
  'The Moon is ~384,400 km from Earth on average.',
  'Apollo 11 took 3 days, 3 hours, 49 minutes to reach lunar orbit.',
  'Chandrayaan-3 took 42 days using a low-energy transfer orbit.',
  'A lunar day (synodic month) lasts ~29.5 Earth days.',
  'Surface temperature ranges from -173°C (night) to +127°C (day).',
  'The Moon has no atmosphere — no parachute-assisted landing possible.',
];

const STATUS_PRIORITY = { green: 0, yellow: 1, red: 2 };

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateToIndex(site, dateStr) {
  const diff = new Date(dateStr + 'T00:00:00Z').getTime() - new Date(site.start).getTime();
  const idx = Math.round(diff / (site.step_hours * 3600 * 1000));
  return Math.max(0, Math.min(idx, site.sun_elev.length - 1));
}

function evaluateSite(site, landingDate, missionDays) {
  const dataStartMs = new Date(site.start).getTime();
  const dataEndMs = dataStartMs + (site.sun_elev.length - 1) * site.step_hours * 3600 * 1000;
  const landingMs = new Date(landingDate + 'T00:00:00Z').getTime();

  if (landingMs < dataStartMs || landingMs > dataEndMs) {
    return {
      site,
      status: 'red',
      verdict: 'NO-GO',
      feasible: false,
      outOfRange: true,
      checks: [
        {
          label: 'Landing date within ephemeris coverage',
          pass: false,
          value: `${landingDate} is outside available dataset range`,
          critical: true,
          tip: 'Choose an earlier launch date or shorter fuel/transit mode so landing falls within 2026.',
        },
      ],
      criticalFails: [{ label: 'Out of data range' }],
      warnings: [],
      summary: {
        sunPct: 0,
        earthPct: 0,
        bothPct: 0,
        darkHrs: 0,
        earthGapHrs: 0,
        sunAtLanding: false,
        earthAtLanding: false,
        landingSunElev: null,
        landingEarthElev: null,
      },
      startIdx: 0,
      windowLen: 0,
    };
  }

  const landingIdx = dateToIndex(site, landingDate);
  const stepsPerDay = Math.round(24 / site.step_hours);
  const windowLen = missionDays * stepsPerDay;
  const end = Math.min(landingIdx + windowLen, site.sun_elev.length);
  const actualLen = end - landingIdx;

  const sunPct = sunlitPercent(site.sun_elev, landingIdx, actualLen);
  const earthPct = earthVisiblePercent(site.earth_elev, landingIdx, actualLen);
  const bothPct = bothAvailablePercent(site.sun_elev, site.earth_elev, landingIdx, actualLen);
  const darkHrs = longestDarknessHours(site.sun_elev, site.step_hours, landingIdx, actualLen);
  const earthGapHrs = longestEarthGapHours(site.earth_elev, site.step_hours, landingIdx, actualLen);

  const landingSunElev = site.sun_elev[landingIdx];
  const landingEarthElev = site.earth_elev[landingIdx];
  const sunAtLanding = typeof landingSunElev === 'number' && landingSunElev > 0;
  const earthAtLanding = typeof landingEarthElev === 'number' && landingEarthElev > 0;

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
      tip:
        darkHrs > 200
          ? "Batteries typically can't sustain the lander beyond 200 hours of darkness."
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

  const criticalFails = checks.filter((c) => c.critical && !c.pass);
  const warnings = checks.filter((c) => !c.critical && !c.pass);
  const allCriticalPass = criticalFails.length === 0;
  const feasible = allCriticalPass && warnings.length <= 2;

  const status = feasible ? 'green' : allCriticalPass ? 'yellow' : 'red';
  const verdict = status === 'green' ? 'GO' : status === 'yellow' ? 'CONDITIONAL' : 'NO-GO';

  return {
    site,
    status,
    verdict,
    feasible,
    outOfRange: false,
    checks,
    criticalFails,
    warnings,
    summary: {
      sunPct,
      earthPct,
      bothPct,
      darkHrs,
      earthGapHrs,
      sunAtLanding,
      earthAtLanding,
      landingSunElev,
      landingEarthElev,
    },
    startIdx: landingIdx,
    windowLen: actualLen,
  };
}

export default function MissionConfigPage({
  data,
  initialStep = 1,
  initialConfig = null,
  onLaunch,
  onBack,
}) {
  // 2-step flow: 1 = Date & Fuel Mode, 2 = Ranked Site Preferences & Analysis
  const [step, setStep] = useState(initialStep);
  const [transitProfile, setTransitProfile] = useState(initialConfig?.transitProfile ?? 'direct');
  const [launchDate, setLaunchDate] = useState(initialConfig?.launchDate ?? '2026-03-15');
  const [missionDays, setMissionDays] = useState(initialConfig?.windowDays ?? initialConfig?.missionDays ?? 14);
  const [selectedSiteId, setSelectedSiteId] = useState(initialConfig?.siteId ?? null);
  const [factIdx, setFactIdx] = useState(0);
  const [animateIn, setAnimateIn] = useState(true);

  useEffect(() => {
    const iv = setInterval(() => setFactIdx((i) => (i + 1) % MOON_FACTS.length), 6000);
    return () => clearInterval(iv);
  }, []);

  // Always scroll to top when mounting or switching steps
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    setAnimateIn(true);
    const t = setTimeout(() => setAnimateIn(false), 600);
    return () => clearTimeout(t);
  }, [step]);

  const fuelMode = FUEL_MODES.find((p) => p.id === transitProfile) ?? FUEL_MODES[0];
  const landingDate = addDays(launchDate, fuelMode.days);
  const missionEndDate = addDays(landingDate, missionDays);

  const firstSite = data?.sites?.[0];
  const dataStart = firstSite?.start?.slice(0, 10) ?? '2026-01-01';
  const dataEnd = firstSite
    ? new Date(
        new Date(firstSite.start).getTime() +
          (firstSite.sun_elev.length - 1) * firstSite.step_hours * 3600 * 1000
      )
        .toISOString()
        .slice(0, 10)
    : '2026-12-31';

  // Evaluate and rank ALL candidate sites automatically
  const rankedEvaluations = useMemo(() => {
    if (!data?.sites?.length) return [];
    const results = data.sites.map((s) => evaluateSite(s, landingDate, missionDays));
    results.sort((a, b) => {
      if (STATUS_PRIORITY[a.status] !== STATUS_PRIORITY[b.status]) {
        return STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
      }
      if (a.criticalFails.length !== b.criticalFails.length) {
        return a.criticalFails.length - b.criticalFails.length;
      }
      if (a.warnings.length !== b.warnings.length) {
        return a.warnings.length - b.warnings.length;
      }
      if (b.summary.bothPct !== a.summary.bothPct) {
        return b.summary.bothPct - a.summary.bothPct;
      }
      return a.summary.darkHrs - b.summary.darkHrs;
    });
    return results;
  }, [data, landingDate, missionDays]);

  // Auto-select the best-ranked site whenever the date or fuel mode changes
  useEffect(() => {
    if (rankedEvaluations.length > 0) {
      setSelectedSiteId(rankedEvaluations[0].site.id);
    }
  }, [rankedEvaluations]);

  const activeEval =
    rankedEvaluations.find((e) => e.site.id === selectedSiteId) ?? rankedEvaluations[0] ?? null;

  const greenCount = rankedEvaluations.filter((e) => e.status === 'green').length;
  const yellowCount = rankedEvaluations.filter((e) => e.status === 'yellow').length;
  const noViableOption = rankedEvaluations.length > 0 && greenCount === 0 && yellowCount === 0;

  const handleProceed = () => {
    if (!activeEval) return;
    onLaunch({
      siteId: activeEval.site.id,
      startDate: landingDate,
      windowDays: missionDays,
      launchDate,
      transitDays: fuelMode.days,
      transitProfile: fuelMode.id,
      landingSunElev: activeEval.summary.landingSunElev,
      landingEarthElev: activeEval.summary.landingEarthElev,
    });
  };

  if (!data || !firstSite) {
    return (
      <div className="min-h-screen bg-[#04080f] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#04080f] text-gray-100 overflow-x-hidden relative">
      {/* Ambient glows */}
      <div
        className="fixed top-[-200px] left-[-100px] w-[500px] h-[500px] rounded-full pointer-events-none z-0"
        style={{ background: 'radial-gradient(circle, rgba(74,158,255,0.05) 0%, transparent 70%)' }}
      />
      <div
        className="fixed bottom-[-200px] right-[-100px] w-[600px] h-[600px] rounded-full pointer-events-none z-0"
        style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.04) 0%, transparent 70%)' }}
      />

      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(24px) } to { opacity:1; transform:translateY(0) } }
        @keyframes pulseGlow { 0%,100% { box-shadow: 0 0 20px rgba(16,185,129,0.15) } 50% { box-shadow: 0 0 40px rgba(16,185,129,0.3) } }
        .fade-up { animation: fadeUp 0.6s ease-out both }
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
          <h1
            className="text-lg font-semibold tracking-[4px] text-white"
            style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
          >
            MISSION CONFIG
          </h1>
          <span className="text-[9px] px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 tracking-wider">
            STEP {step}/2
          </span>
        </div>

        {/* Step indicators (2 steps: Dates & Fuel Mode → Site Recommendations) */}
        <div className="hidden sm:flex items-center gap-2">
          {[
            { n: 1, label: 'Date & Fuel Mode' },
            { n: 2, label: 'Best Landing Sites' },
          ].map((s, i) => (
            <React.Fragment key={s.n}>
              {i > 0 && (
                <div className={`w-8 h-px ${step >= s.n ? 'bg-blue-500/60' : 'bg-gray-700'}`} />
              )}
              <button
                onClick={() => s.n <= step && setStep(s.n)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs tracking-wider transition-all cursor-pointer
                  ${
                    step === s.n
                      ? 'bg-blue-500/15 border border-blue-500/40 text-blue-300'
                      : step > s.n
                        ? 'border border-blue-500/20 text-blue-400/60 hover:text-blue-300'
                        : 'border border-gray-800 text-gray-600'
                  }`}
              >
                <span
                  className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold
                  ${
                    step === s.n
                      ? 'bg-blue-500/30 text-blue-200'
                      : step > s.n
                        ? 'bg-blue-500/10 text-blue-400'
                        : 'bg-gray-800 text-gray-600'
                  }`}
                >
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
            STEP 1: DATE & FUEL MODE SETTINGS
           ══════════════════════════════════════════════════ */}
        {step === 1 && (
          <div className={animateIn ? 'fade-up' : ''}>
            <p className="text-[10px] tracking-[3px] uppercase text-blue-400 mb-3">Step 1 of 2</p>
            <h2
              className="text-3xl font-bold text-white mb-2"
              style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
            >
              Configure Launch Date & Fuel Mode
            </h2>
            <p className="text-sm text-gray-400 mb-8 max-w-2xl">
              Select your <strong className="text-blue-300">fuel / transfer mode</strong>,{' '}
              <strong className="text-blue-300">Earth launch date</strong>, and{' '}
              <strong className="text-amber-300">mission duration</strong>. We will automatically
              evaluate all {data.sites.length} lunar landing sites and rank the best available
              options for you.
            </p>

            {/* Fuel / Transfer Mode selection */}
            <div className="mb-8">
              <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-3 block">
                ⛽ Fuel Mode & Transfer Orbit
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {FUEL_MODES.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setTransitProfile(p.id)}
                    className={`text-left p-4 rounded-xl border transition-all cursor-pointer
                      ${
                        transitProfile === p.id
                          ? 'bg-blue-500/10 border-blue-500/40 shadow-[0_0_20px_rgba(74,158,255,0.12)]'
                          : 'bg-[#0a1628]/60 border-gray-800 hover:border-blue-500/25'
                      }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-semibold text-white">{p.name}</span>
                      <span
                        className={`text-lg font-bold ${
                          transitProfile === p.id ? 'text-blue-300' : 'text-gray-400'
                        }`}
                      >
                        {p.days}d
                      </span>
                    </div>
                    <span
                      className={`inline-block text-[10px] px-2 py-0.5 rounded mb-2 border ${
                        p.id === 'direct'
                          ? 'bg-amber-500/10 border-amber-500/25 text-amber-300'
                          : p.id === 'standard'
                            ? 'bg-blue-500/10 border-blue-500/25 text-blue-300'
                            : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                      }`}
                    >
                      {p.fuelTag}
                    </span>
                    <p className="text-[11px] text-gray-400 leading-relaxed">{p.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive Flight Calendar */}
            <div className="mb-8">
              <MissionCalendar
                site={activeEval?.site || firstSite}
                launchDate={launchDate}
                onSelectLaunchDate={setLaunchDate}
                transitDays={fuelMode.days}
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
                How many days should the lander operate on the surface? (1 lunar day ≈ 29.5 Earth
                days)
              </p>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={1}
                  max={180}
                  value={missionDays}
                  onChange={(e) => setMissionDays(Number(e.target.value))}
                  className="flex-1 accent-amber-500 cursor-pointer"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={missionDays}
                    onChange={(e) =>
                      setMissionDays(Math.max(1, Math.min(365, Number(e.target.value))))
                    }
                    className="w-20 bg-[#162038] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white text-center
                      focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                  <span className="text-sm text-gray-400">days</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {[7, 14, 30, 60, 90, 180].map((d) => (
                  <button
                    key={d}
                    onClick={() => setMissionDays(d)}
                    className={`text-[10px] px-3 py-1 rounded-lg border cursor-pointer transition-all
                      ${
                        missionDays === d
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                          : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-300'
                      }`}
                  >
                    {d} days {d === 30 ? '(~1 lunar day)' : d === 180 ? '(6 months)' : ''}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-500 mt-3">
                Mission ends: <span className="text-gray-300 font-mono">{missionEndDate}</span>
              </p>
            </div>

            {/* Moon fact ticker */}
            <div className="bg-[#0a1628]/40 border border-blue-500/10 rounded-lg px-5 py-3 mb-8">
              <p className="text-[10px] tracking-wider uppercase text-blue-400/60 mb-1">
                Did you know?
              </p>
              <p className="text-xs text-gray-300 transition-all duration-500">
                {MOON_FACTS[factIdx]}
              </p>
            </div>

            <button
              onClick={() => {
                window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
                setStep(2);
              }}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl cursor-pointer
                bg-gradient-to-br from-blue-600 to-blue-500 text-white font-medium text-sm tracking-wide
                shadow-[0_4px_25px_rgba(26,138,255,0.3)] hover:shadow-[0_8px_35px_rgba(26,138,255,0.4)]
                hover:-translate-y-0.5 transition-all"
            >
              Find Best Landing Sites →
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            STEP 2: RANKED SITE PREFERENCES & ANALYSIS
           ══════════════════════════════════════════════════ */}
        {step === 2 && activeEval && (
          <div className={animateIn ? 'fade-up' : ''}>
            <p className="text-[10px] tracking-[3px] uppercase text-blue-400 mb-3">Step 2 of 2</p>
            <h2
              className="text-3xl font-bold text-white mb-2"
              style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
            >
              Recommended Landing Sites
            </h2>
            <p className="text-sm text-gray-400 mb-6 max-w-2xl">
              Evaluated all {rankedEvaluations.length} candidate sites using JPL Horizons data for
              landing on <strong className="text-emerald-300">{landingDate}</strong> (
              {fuelMode.name} · {fuelMode.fuelTag}, {missionDays}-day mission).
            </p>

            {/* OVERALL AVAILABILITY INDICATOR BANNER (Green / Yellow / Red) */}
            <div
              className={`rounded-2xl p-6 mb-8 border-2 transition-all ${
                noViableOption
                  ? 'bg-red-500/10 border-red-500/40'
                  : greenCount > 0
                    ? 'bg-emerald-500/8 border-emerald-500/35'
                    : 'bg-amber-500/8 border-amber-500/35'
              }`}
              style={
                !noViableOption && greenCount > 0
                  ? { animation: 'pulseGlow 3s ease-in-out infinite' }
                  : {}
              }
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 border ${
                      noViableOption
                        ? 'bg-red-500/20 border-red-500/40 text-red-400'
                        : greenCount > 0
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                          : 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                    }`}
                  >
                    {noViableOption ? '🔴' : greenCount > 0 ? '🟢' : '🟡'}
                  </div>
                  <div>
                    <h3
                      className={`text-xl font-bold tracking-wide ${
                        noViableOption
                          ? 'text-red-400'
                          : greenCount > 0
                            ? 'text-emerald-400'
                            : 'text-amber-400'
                      }`}
                      style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
                    >
                      {noViableOption
                        ? 'NO VIABLE LANDING OPTION AVAILABLE'
                        : greenCount > 0
                          ? `${greenCount} BEST OPTION${greenCount > 1 ? 'S' : ''} AVAILABLE (GO)`
                          : `${yellowCount} MARGINAL OPTION${yellowCount > 1 ? 'S' : ''} ONLY (CONDITIONAL)`}
                    </h3>
                    <p
                      className={`text-xs mt-1 ${
                        noViableOption
                          ? 'text-red-300/90'
                          : greenCount > 0
                            ? 'text-emerald-200/80'
                            : 'text-amber-200/80'
                      }`}
                    >
                      {noViableOption
                        ? 'All 4 candidate landing sites fail critical Sun/Earth landing checks during this window. Try adjusting the launch date or switching fuel mode.'
                        : greenCount > 0
                          ? `Top preference: ${rankedEvaluations[0].site.name || rankedEvaluations[0].site.full_name}. Select any site card below to inspect details or launch the simulator.`
                          : 'No Green (GO) site is available for this date, but marginal Yellow options pass critical landing checks. Review warnings before proceeding.'}
                    </p>
                  </div>
                </div>

                {/* Status counts pill summary */}
                <div className="flex items-center gap-2 shrink-0 text-xs font-mono">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                    {greenCount} Green
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300">
                    {yellowCount} Yellow
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300">
                    {rankedEvaluations.length - greenCount - yellowCount} Red
                  </span>
                </div>
              </div>
            </div>

            {/* 4 RANKED SITE PREFERENCE CARDS */}
            <div className="mb-8">
              <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-3">
                Ranked Landing Preferences (Select a site to inspect & simulate)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {rankedEvaluations.map((ev, rankIdx) => {
                  const isSelected = ev.site.id === activeEval.site.id;
                  const statusStyles = {
                    green: {
                      badge: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
                      ring: isSelected
                        ? 'bg-emerald-500/10 border-emerald-400/60 shadow-[0_0_25px_rgba(16,185,129,0.15)]'
                        : 'bg-[#0a1628]/70 border-emerald-500/25 hover:border-emerald-400/50',
                      dot: 'bg-emerald-400',
                      label: 'GREEN · GO',
                    },
                    yellow: {
                      badge: 'bg-amber-500/20 border-amber-500/40 text-amber-300',
                      ring: isSelected
                        ? 'bg-amber-500/10 border-amber-400/60 shadow-[0_0_25px_rgba(245,158,11,0.15)]'
                        : 'bg-[#0a1628]/70 border-amber-500/25 hover:border-amber-400/50',
                      dot: 'bg-amber-400',
                      label: 'YELLOW · CONDITIONAL',
                    },
                    red: {
                      badge: 'bg-red-500/20 border-red-500/40 text-red-300',
                      ring: isSelected
                        ? 'bg-red-500/10 border-red-400/60 shadow-[0_0_25px_rgba(239,68,68,0.15)]'
                        : 'bg-[#0a1628]/60 border-red-500/20 hover:border-red-400/40 opacity-85',
                      dot: 'bg-red-400',
                      label: 'RED · NO-GO',
                    },
                  }[ev.status];

                  return (
                    <button
                      key={ev.site.id}
                      onClick={() => setSelectedSiteId(ev.site.id)}
                      className={`text-left p-5 rounded-xl border-2 transition-all cursor-pointer ${statusStyles.ring}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-white/10 text-gray-200 shrink-0">
                            #{rankIdx + 1}
                          </span>
                          <h3 className="text-sm font-semibold text-white truncate">
                            {ev.site.name || ev.site.full_name}
                          </h3>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0 ${statusStyles.badge}`}
                        >
                          <span className={`w-2 h-2 rounded-full ${statusStyles.dot}`} />
                          {statusStyles.label}
                        </span>
                      </div>

                      <p className="text-[11px] text-gray-400 mb-3">
                        {(ev.site.latitude ?? ev.site.lat)?.toFixed(2)}°
                        {(ev.site.latitude ?? ev.site.lat) >= 0 ? 'N' : 'S'},{' '}
                        {(ev.site.longitude ?? ev.site.lon)?.toFixed(2)}°E
                        {rankIdx === 0 && ev.status !== 'red' && (
                          <span className="ml-2 text-emerald-300 font-medium">★ Best Choice</span>
                        )}
                      </p>

                      <div className="grid grid-cols-4 gap-2 text-center bg-black/25 rounded-lg p-2.5">
                        <div>
                          <div className="text-xs font-bold text-white">
                            {ev.summary.sunPct.toFixed(0)}%
                          </div>
                          <div className="text-[9px] text-gray-500 uppercase">Sunlit</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white">
                            {ev.summary.earthPct.toFixed(0)}%
                          </div>
                          <div className="text-[9px] text-gray-500 uppercase">Earth</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white">
                            {ev.summary.bothPct.toFixed(0)}%
                          </div>
                          <div className="text-[9px] text-gray-500 uppercase">Both</div>
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white">
                            {ev.summary.darkHrs.toFixed(0)}h
                          </div>
                          <div className="text-[9px] text-gray-500 uppercase">Max Dark</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* DETAILED CHECKLIST FOR SELECTED SITE */}
            <div className="bg-[#0a1628]/70 border border-gray-800 rounded-xl p-6 mb-6">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-blue-500/15 flex items-center justify-center text-xs">
                    📋
                  </span>
                  Feasibility Breakdown — {activeEval.site.name || activeEval.site.full_name}
                </h3>
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                    activeEval.status === 'green'
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                      : activeEval.status === 'yellow'
                        ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                        : 'bg-red-500/15 border-red-500/30 text-red-300'
                  }`}
                >
                  {activeEval.verdict}
                </span>
              </div>

              <div className="space-y-3">
                {activeEval.checks.map((c, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 p-3 rounded-lg border transition-all
                    ${
                      c.pass
                        ? 'bg-emerald-500/5 border-emerald-500/15'
                        : c.critical
                          ? 'bg-red-500/8 border-red-500/25'
                          : 'bg-amber-500/5 border-amber-500/15'
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-sm
                      ${
                        c.pass
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : c.critical
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      {c.pass ? '✓' : c.critical ? '✕' : '!'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-white font-medium">{c.label}</span>
                        <span
                          className={`text-xs font-mono ${
                            c.pass
                              ? 'text-emerald-300'
                              : c.critical
                                ? 'text-red-300'
                                : 'text-amber-300'
                          }`}
                        >
                          {c.value}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-1">{c.tip}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick stats for selected site */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              <StatCard label="Sunlit" value={`${activeEval.summary.sunPct.toFixed(0)}%`} icon="☀️" />
              <StatCard
                label="Earth Visible"
                value={`${activeEval.summary.earthPct.toFixed(0)}%`}
                icon="🌍"
              />
              <StatCard
                label="Max Darkness"
                value={`${activeEval.summary.darkHrs.toFixed(0)}h`}
                icon="🌑"
              />
              <StatCard
                label="Max Comm Gap"
                value={`${activeEval.summary.earthGapHrs.toFixed(0)}h`}
                icon="📡"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl cursor-pointer
                  bg-white/[0.03] border border-white/10 text-gray-300 text-sm
                  hover:bg-white/[0.06] hover:border-white/20 transition-all"
              >
                ← Adjust Date / Fuel Mode
              </button>

              <button
                onClick={handleProceed}
                disabled={activeEval.outOfRange}
                className={`inline-flex items-center gap-2.5 px-8 py-3.5 rounded-xl font-medium text-sm tracking-wide
                  transition-all ${
                    activeEval.outOfRange
                      ? 'bg-gray-800 border border-gray-700 text-gray-500 cursor-not-allowed'
                      : activeEval.status === 'red'
                        ? 'cursor-pointer hover:-translate-y-0.5 bg-gradient-to-br from-red-600/20 to-red-500/10 border border-red-500/30 text-red-300 shadow-[0_4px_15px_rgba(255,50,50,0.15)]'
                        : activeEval.status === 'yellow'
                          ? 'cursor-pointer hover:-translate-y-0.5 bg-gradient-to-br from-amber-600 to-amber-500 text-white shadow-[0_4px_25px_rgba(245,158,11,0.3)] hover:shadow-[0_8px_35px_rgba(245,158,11,0.4)]'
                          : 'cursor-pointer hover:-translate-y-0.5 bg-gradient-to-br from-emerald-600 to-emerald-500 text-white shadow-[0_4px_25px_rgba(16,185,129,0.3)] hover:shadow-[0_8px_35px_rgba(16,185,129,0.4)]'
                  }`}
              >
                <span className="text-lg">🚀</span>
                {activeEval.status === 'red'
                  ? `Simulate ${activeEval.site.name} Anyway (Not Recommended)`
                  : activeEval.status === 'yellow'
                    ? `Proceed to ${activeEval.site.name} (With Caution)`
                    : `Launch Simulator — ${activeEval.site.name}`}
              </button>
            </div>
          </div>
        )}
      </div>

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
    <div
      className={`flex flex-col items-center px-4 py-3 rounded-xl border ${colorMap[color]} shrink-0`}
    >
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
      <div
        className="text-lg font-bold text-white mt-1"
        style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
      >
        {value}
      </div>
      <div className="text-[10px] text-gray-500 tracking-wider uppercase mt-0.5">{label}</div>
    </div>
  );
}
