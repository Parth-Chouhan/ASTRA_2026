import React, { useState, useMemo, useEffect } from 'react';

/**
 * MissionCalendar — Next-Generation Space Mission Calendar
 *
 * Features:
 *  - Interactive monthly calendar with Earth launch, transit corridor, and lunar landing highlights
 *  - Per-day solar illumination indicators (☀️ Daylight vs 🌑 Lunar Night) computed from JPL Horizons data
 *  - "Auto-Align to Daylight" quick-action to snap directly to safe sunlit landing windows
 *  - Full 365-day Year Heatmap mode (visualizing solar & comms availability)
 *  - Interactive hover tooltips with precise elevation angles and mission phase
 *  - Live mission flight path ribbon
 */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// Color scale for heatmap
function pctToHeatColor(pct) {
  if (pct <= 0) return 'rgba(185, 28, 28, 0.6)'; // red
  if (pct >= 100) return 'rgba(16, 185, 129, 0.9)'; // bright emerald
  if (pct < 50) {
    const t = pct / 50;
    return `rgba(${Math.round(185 + 70 * t)}, ${Math.round(28 + 150 * t)}, 30, 0.75)`;
  }
  const t = (pct - 50) / 50;
  return `rgba(${Math.round(245 * (1 - t) + 16 * t)}, ${Math.round(200 * (1 - t) + 185 * t)}, ${Math.round(50 * (1 - t) + 129 * t)}, 0.85)`;
}

export default function MissionCalendar({
  site,
  launchDate,
  onSelectLaunchDate,
  transitDays,
  landingDate,
  missionDays,
  missionEndDate,
  dataStart = '2026-01-01',
  dataEnd = '2026-12-31',
}) {
  // Initial month based on launchDate
  const initialDate = useMemo(() => new Date((launchDate || '2026-03-15') + 'T00:00:00Z'), [launchDate]);
  const [viewYear, setViewYear] = useState(initialDate.getUTCFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getUTCMonth());
  const [viewMode, setViewMode] = useState('month'); // 'month' | 'heatmap'
  const [hoveredDate, setHoveredDate] = useState(null);

  // Sync calendar month when launchDate changes externally
  useEffect(() => {
    if (launchDate) {
      const dt = new Date(launchDate + 'T00:00:00Z');
      if (!isNaN(dt.getTime())) {
        setViewYear(dt.getUTCFullYear());
        setViewMonth(dt.getUTCMonth());
      }
    }
  }, [launchDate]);

  // Precompute daily solar elevation lookup for the entire site dataset (~365 days)
  const dailySolarData = useMemo(() => {
    if (!site?.sun_elev || !site?.start) return new Map();
    const map = new Map();
    const startMs = new Date(site.start).getTime();
    const stepMs = site.step_hours * 3600 * 1000;
    const stepsPerDay = Math.round(24 / site.step_hours);

    for (let day = 0; day < 366; day++) {
      const dayMs = startMs + day * 86400000;
      const dateStr = new Date(dayMs).toISOString().slice(0, 10);
      const startIdx = day * stepsPerDay;

      if (startIdx >= site.sun_elev.length) break;

      const endIdx = Math.min(startIdx + stepsPerDay, site.sun_elev.length);
      let sunlitCount = 0;
      let validCount = 0;
      let maxSun = -999;
      let noonSun = site.sun_elev[startIdx + Math.floor(stepsPerDay / 2)] ?? -999;
      let earthCount = 0;

      for (let i = startIdx; i < endIdx; i++) {
        const s = site.sun_elev[i];
        const e = site.earth_elev ? site.earth_elev[i] : null;
        if (typeof s === 'number') {
          validCount++;
          if (s > 0) sunlitCount++;
          if (s > maxSun) maxSun = s;
        }
        if (typeof e === 'number' && e > 0) {
          earthCount++;
        }
      }

      const sunlitPct = validCount > 0 ? (sunlitCount / validCount) * 100 : 0;
      const earthPct = validCount > 0 ? (earthCount / validCount) * 100 : 0;
      const isSunlit = maxSun > 0;

      map.set(dateStr, {
        dateStr,
        sunlitPct,
        maxSun,
        noonSun,
        earthPct,
        isSunlit,
        landingElev: site.sun_elev[startIdx] ?? 0,
      });
    }

    return map;
  }, [site]);

  // Calendar matrix calculations for current viewMonth
  const calendarDays = useMemo(() => {
    const firstDay = new Date(Date.UTC(viewYear, viewMonth, 1));
    const firstWeekday = firstDay.getUTCDay(); // 0 = Sun
    const daysInMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0)).getUTCDate();
    const daysInPrevMonth = new Date(Date.UTC(viewYear, viewMonth, 0)).getUTCDate();

    const cells = [];

    // Prev month padding
    for (let i = firstWeekday - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevDate = new Date(Date.UTC(viewYear, viewMonth - 1, d)).toISOString().slice(0, 10);
      cells.push({
        dayNum: d,
        dateStr: prevDate,
        isCurrentMonth: false,
        isOutOfRange: true,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = new Date(Date.UTC(viewYear, viewMonth, d)).toISOString().slice(0, 10);
      const isOutOfRange = dateStr < dataStart || dateStr > dataEnd;
      const solar = dailySolarData.get(dateStr);

      const isLaunch = dateStr === launchDate;
      const isLanding = dateStr === landingDate;
      const isTransit = dateStr > launchDate && dateStr < landingDate;
      const isOps = dateStr >= landingDate && dateStr <= missionEndDate;

      cells.push({
        dayNum: d,
        dateStr,
        isCurrentMonth: true,
        isOutOfRange,
        solar,
        isLaunch,
        isLanding,
        isTransit,
        isOps,
      });
    }

    // Next month padding to fill out 35 or 42 grid slots
    const totalSlots = Math.ceil(cells.length / 7) * 7;
    const remaining = totalSlots - cells.length;
    for (let d = 1; d <= remaining; d++) {
      const nextDate = new Date(Date.UTC(viewYear, viewMonth + 1, d)).toISOString().slice(0, 10);
      cells.push({
        dayNum: d,
        dateStr: nextDate,
        isCurrentMonth: false,
        isOutOfRange: true,
      });
    }

    return cells;
  }, [viewYear, viewMonth, dataStart, dataEnd, dailySolarData, launchDate, landingDate, missionEndDate]);

  // Navigate months
  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(y => y - 1);
    } else {
      setViewMonth(m => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(y => y + 1);
    } else {
      setViewMonth(m => m + 1);
    }
  };

  // Find next optimal launch date with daylight landing
  const handleAutoAlignDaylight = () => {
    if (!site?.sun_elev || !site?.start) return;
    const startMs = new Date(site.start).getTime();
    const stepMs = site.step_hours * 3600 * 1000;
    const currLaunchMs = new Date(launchDate + 'T00:00:00Z').getTime();
    const startIdx = Math.max(0, Math.round((currLaunchMs - startMs) / stepMs));
    const transitSteps = Math.round((transitDays * 24) / site.step_hours);

    // Look forward up to 60 days
    for (let i = startIdx + 12; i < Math.min(startIdx + 60 * 12, site.sun_elev.length - transitSteps); i += 12) {
      const landingIdx = i + transitSteps;
      if (site.sun_elev[landingIdx] > 5) {
        const foundLaunchDate = new Date(startMs + i * stepMs).toISOString().slice(0, 10);
        onSelectLaunchDate(foundLaunchDate);
        const ld = new Date(foundLaunchDate + 'T00:00:00Z');
        setViewYear(ld.getUTCFullYear());
        setViewMonth(ld.getUTCMonth());
        return;
      }
    }

    // If none found forward, search from beginning of dataset
    for (let i = 0; i < site.sun_elev.length - transitSteps; i += 12) {
      const landingIdx = i + transitSteps;
      if (site.sun_elev[landingIdx] > 5) {
        const foundLaunchDate = new Date(startMs + i * stepMs).toISOString().slice(0, 10);
        onSelectLaunchDate(foundLaunchDate);
        const ld = new Date(foundLaunchDate + 'T00:00:00Z');
        setViewYear(ld.getUTCFullYear());
        setViewMonth(ld.getUTCMonth());
        return;
      }
    }
  };

  // Stats for the active landing day
  const landingStats = dailySolarData.get(landingDate);
  const isLandingSunlit = landingStats ? landingStats.landingElev > 0 || landingStats.isSunlit : false;

  // Active tooltip or selected date details
  const activeDetailDate = hoveredDate || launchDate;
  const activeDetailStats = dailySolarData.get(activeDetailDate);

  return (
    <div className="bg-[#07101f] border border-blue-500/20 rounded-2xl p-5 sm:p-6 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl">
      {/* ═══ CALENDAR HEADER & CONTROLS ═══ */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-5 border-b border-blue-500/10">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-[2.5px] text-blue-400 font-semibold">
              Mission Flight Calendar
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-300 font-mono">
              2026 Season
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Click any date on the calendar to set your <strong className="text-blue-300">Earth Launch date</strong>.
          </p>
        </div>

        {/* View Mode Toggle & Smart Presets */}
        <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto">
          <button
            type="button"
            onClick={handleAutoAlignDaylight}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer
              bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 hover:border-amber-400/50 transition-all shadow-sm"
            title="Automatically adjust launch date so the lander touches down in sunlight"
          >
            <span>☀️</span>
            <span>Align to Daylight</span>
          </button>

          <div className="flex bg-[#0d1c33] border border-blue-500/15 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                viewMode === 'month'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Month View
            </button>
            <button
              type="button"
              onClick={() => setViewMode('heatmap')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                viewMode === 'heatmap'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              Year Heatmap
            </button>
          </div>
        </div>
      </div>

      {/* ═══ MONTH VIEW ═══ */}
      {viewMode === 'month' && (
        <div className="pt-4">
          {/* Month Bar & Quick Month Selectors */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={prevMonth}
                disabled={viewYear === 2026 && viewMonth === 0}
                className="w-8 h-8 rounded-lg bg-[#0d1c33] border border-blue-500/20 flex items-center justify-center text-gray-300 hover:text-white hover:border-blue-400/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                ‹
              </button>

              <div className="text-base sm:text-lg font-bold text-white tracking-wide" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
                {MONTH_NAMES[viewMonth]} {viewYear}
              </div>

              <button
                type="button"
                onClick={nextMonth}
                disabled={viewYear === 2026 && viewMonth === 11}
                className="w-8 h-8 rounded-lg bg-[#0d1c33] border border-blue-500/20 flex items-center justify-center text-gray-300 hover:text-white hover:border-blue-400/40 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                ›
              </button>
            </div>

            {/* Quick Month Pill Carousel */}
            <div className="hidden md:flex items-center gap-1 overflow-x-auto py-1">
              {MONTH_NAMES.map((m, idx) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setViewMonth(idx)}
                  className={`text-[10px] px-2 py-1 rounded font-mono transition-all cursor-pointer ${
                    viewMonth === idx
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 font-bold'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                  }`}
                >
                  {m.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2 text-center mb-2">
            {WEEKDAYS.map((w, idx) => (
              <div
                key={w}
                className={`text-[10px] font-semibold tracking-wider ${
                  idx === 0 || idx === 6 ? 'text-gray-500' : 'text-blue-400/80'
                }`}
              >
                {w}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {calendarDays.map((cell, idx) => {
              const { dayNum, dateStr, isCurrentMonth, isOutOfRange, solar, isLaunch, isLanding, isTransit, isOps } = cell;

              if (!isCurrentMonth) {
                return (
                  <div
                    key={idx}
                    className="min-h-[56px] sm:min-h-[68px] rounded-xl p-1.5 bg-[#0a1424]/20 border border-transparent opacity-25 flex flex-col justify-between"
                  >
                    <span className="text-xs font-mono text-gray-600">{dayNum}</span>
                  </div>
                );
              }

              // Styling states
              let cellClass = 'bg-[#0a1628]/60 border-blue-500/10 hover:border-blue-400/40 text-gray-300';
              if (isLaunch) {
                cellClass = 'bg-blue-600/30 border-blue-400 text-white shadow-[0_0_15px_rgba(59,130,246,0.35)] ring-1 ring-blue-400/50';
              } else if (isLanding) {
                cellClass = 'bg-emerald-600/30 border-emerald-400 text-white shadow-[0_0_15px_rgba(16,185,129,0.35)] ring-2 ring-emerald-400/60 animate-pulse';
              } else if (isTransit) {
                cellClass = 'bg-blue-950/40 border-blue-500/30 text-blue-300 border-dashed';
              } else if (isOps) {
                cellClass = 'bg-emerald-950/20 border-emerald-500/20 text-emerald-200/90';
              }

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={isOutOfRange}
                  onClick={() => onSelectLaunchDate(dateStr)}
                  onMouseEnter={() => setHoveredDate(dateStr)}
                  onMouseLeave={() => setHoveredDate(null)}
                  className={`min-h-[58px] sm:min-h-[72px] rounded-xl p-1.5 sm:p-2 border transition-all duration-150 flex flex-col justify-between text-left relative overflow-hidden group cursor-pointer ${cellClass} ${
                    isOutOfRange ? 'opacity-30 cursor-not-allowed hover:border-transparent' : ''
                  }`}
                >
                  {/* Top row: day number & solar indicator */}
                  <div className="flex items-center justify-between w-full">
                    <span
                      className={`text-xs sm:text-sm font-mono font-medium ${
                        isLaunch || isLanding ? 'font-bold text-white' : ''
                      }`}
                    >
                      {dayNum}
                    </span>

                    {/* Solar light dot indicator on lunar surface for this day */}
                    {solar && !isOutOfRange && (
                      <span
                        className={`w-2 h-2 rounded-full transition-transform group-hover:scale-125 ${
                          solar.isSunlit
                            ? 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]'
                            : 'bg-gray-700'
                        }`}
                        title={solar.isSunlit ? `☀️ Sunlit (~${solar.maxSun.toFixed(0)}° elev)` : '🌑 Lunar Night'}
                      />
                    )}
                  </div>

                  {/* Bottom indicator badge */}
                  <div className="w-full mt-1">
                    {isLaunch && (
                      <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/30 text-[9px] font-bold text-blue-200 tracking-wider">
                        <span>🚀</span>
                        <span className="hidden sm:inline">LAUNCH</span>
                      </div>
                    )}
                    {isTransit && (
                      <div className="inline-flex items-center gap-0.5 text-[8px] sm:text-[9px] text-blue-300/80 font-mono">
                        <span className="hidden sm:inline">🛸 transit</span>
                        <span className="sm:hidden">→</span>
                      </div>
                    )}
                    {isLanding && (
                      <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/30 text-[9px] font-bold text-emerald-200 tracking-wider">
                        <span>🌙</span>
                        <span className="hidden sm:inline">LANDING</span>
                      </div>
                    )}
                    {!isLaunch && !isLanding && !isTransit && isOps && (
                      <div className="text-[8px] text-emerald-400/60 font-mono hidden sm:block">
                        ops
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ YEAR HEATMAP VIEW (Integrated 365-Day Overview) ═══ */}
      {viewMode === 'heatmap' && (
        <div className="pt-4">
          <div className="flex items-center justify-between mb-3 text-xs text-gray-400">
            <span>2026 Full-Year Solar Availability at <strong>{site?.name || 'Selected Site'}</strong>:</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500">Darkness (0%)</span>
              <div className="w-20 h-2 rounded bg-gradient-to-r from-red-700 via-amber-500 to-emerald-500" />
              <span className="text-[10px] text-emerald-400">Sunlit (100%)</span>
            </div>
          </div>

          <div className="bg-[#0a1628]/80 border border-blue-500/10 rounded-xl p-4 overflow-x-auto">
            <div className="grid grid-rows-7 grid-flow-col gap-1 w-max">
              {Array.from(dailySolarData.values()).map((d, i) => {
                const isLaunch = d.dateStr === launchDate;
                const isLanding = d.dateStr === landingDate;
                const inWindow = d.dateStr >= landingDate && d.dateStr <= missionEndDate;

                let outline = 'none';
                if (isLaunch) outline = '2px solid #3b82f6';
                else if (isLanding) outline = '2px solid #10b981';
                else if (inWindow) outline = '1px solid rgba(16, 185, 129, 0.4)';

                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      onSelectLaunchDate(d.dateStr);
                      const dt = new Date(d.dateStr + 'T00:00:00Z');
                      setViewYear(dt.getUTCFullYear());
                      setViewMonth(dt.getUTCMonth());
                    }}
                    onMouseEnter={() => setHoveredDate(d.dateStr)}
                    onMouseLeave={() => setHoveredDate(null)}
                    style={{
                      backgroundColor: pctToHeatColor(d.sunlitPct),
                      outline,
                    }}
                    className="w-3.5 h-3.5 rounded-sm transition-transform hover:scale-150 relative cursor-pointer"
                    title={`${d.dateStr}: ${d.sunlitPct.toFixed(0)}% Sunlit`}
                  />
                );
              })}
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            💡 Tip: Click any square above to choose that date as your launch date. Bright green zones indicate long uninterrupted lunar daylight.
          </p>
        </div>
      )}

      {/* ═══ LIVE MISSION FLIGHT PATH RIBBON ═══ */}
      <div className="mt-6 pt-5 border-t border-blue-500/10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Launch Box */}
          <div className="bg-[#0d1c33]/80 border border-blue-500/20 rounded-xl p-3.5 flex items-center justify-between">
            <div className="flex-1 mr-2">
              <div className="flex items-center gap-1.5 text-[11px] text-blue-400 uppercase tracking-wider font-semibold">
                <span>🚀</span> Launch from Earth
              </div>
              <input
                type="date"
                value={launchDate}
                min={dataStart}
                max={dataEnd}
                onChange={e => e.target.value && onSelectLaunchDate(e.target.value)}
                className="text-sm sm:text-base font-mono font-bold text-white mt-1 bg-transparent border-0 border-b border-blue-500/30 hover:border-blue-400 focus:border-blue-400 focus:outline-none cursor-pointer w-full max-w-[170px]"
              />
            </div>
            <div className="text-right">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Transit</span>
              <span className="text-xs font-mono text-blue-300 font-semibold">{transitDays} days</span>
            </div>
          </div>

          {/* Landing Box */}
          <div className={`border rounded-xl p-3.5 flex items-center justify-between ${
            isLandingSunlit
              ? 'bg-emerald-950/20 border-emerald-500/30'
              : 'bg-red-950/20 border-red-500/30'
          }`}>
            <div>
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold">
                <span>🌙</span>
                <span className={isLandingSunlit ? 'text-emerald-400' : 'text-red-400'}>
                  Touchdown on Moon
                </span>
              </div>
              <div className="text-sm sm:text-base font-mono font-bold text-white mt-1">
                {landingDate}
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Lighting</span>
              <span className={`text-xs font-mono font-semibold ${isLandingSunlit ? 'text-emerald-300' : 'text-red-400'}`}>
                {isLandingSunlit
                  ? `☀️ +${(landingStats?.landingElev ?? 10).toFixed(1)}°`
                  : `🌑 ${(landingStats?.landingElev ?? -30).toFixed(1)}°`}
              </span>
            </div>
          </div>

          {/* Mission Ops Box */}
          <div className="bg-[#0d1c33]/80 border border-amber-500/20 rounded-xl p-3.5 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-[11px] text-amber-400 uppercase tracking-wider font-semibold">
                <span>📡</span> Mission Complete
              </div>
              <div className="text-sm sm:text-base font-mono font-bold text-white mt-1">
                {missionEndDate}
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider block">Surface Ops</span>
              <span className="text-xs font-mono text-amber-300 font-semibold">{missionDays} days</span>
            </div>
          </div>
        </div>

        {/* Real-time Verdict Banner */}
        <div className={`mt-3 px-4 py-2.5 rounded-xl border flex items-center justify-between text-xs ${
          isLandingSunlit
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
            : 'bg-red-500/10 border-red-500/20 text-red-300'
        }`}>
          <div className="flex items-center gap-2">
            <span className="text-sm">{isLandingSunlit ? '✅' : '⚠️'}</span>
            <span>
              {isLandingSunlit
                ? `Optimal Landing Conditions: Sun is ${(landingStats?.landingElev ?? 10).toFixed(1)}° above the horizon on touchdown date (${landingDate}). Solar panels active.`
                : `Lunar Night Warning: Sun is ${(landingStats?.landingElev ?? -30).toFixed(1)}° below horizon on touchdown date (${landingDate}). Lander must rely 100% on battery.`}
            </span>
          </div>
          {!isLandingSunlit && (
            <button
              type="button"
              onClick={handleAutoAlignDaylight}
              className="text-[11px] underline font-semibold text-amber-300 hover:text-amber-200 cursor-pointer ml-3 whitespace-nowrap"
            >
              Fix: Align to Daylight →
            </button>
          )}
        </div>
      </div>

      {/* ═══ CALENDAR LEGEND ═══ */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-blue-500/10 text-[11px] text-gray-400">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span>Launch Day (Earth)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded border border-dashed border-blue-400" />
            <span>Transit Corridor (In-Flight)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span>Touchdown (Moon)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.8)]" />
            <span>Lunar Daytime</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-gray-700" />
            <span>Lunar Night</span>
          </div>
        </div>

        {activeDetailStats && (
          <div className="font-mono text-[10px] text-blue-300/80 bg-blue-950/40 px-2 py-0.5 rounded border border-blue-500/20">
            Selected: {activeDetailDate} · Max Sun: {activeDetailStats.maxSun > -900 ? `${activeDetailStats.maxSun.toFixed(1)}°` : 'N/A'}
          </div>
        )}
      </div>
    </div>
  );
}
