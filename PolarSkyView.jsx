import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Play, Pause, SkipForward, SkipBack, Maximize2, Minimize2 } from 'lucide-react';
import SkyDome3D from './SkyDome3D.jsx';
import MoonOverview3D from './MoonOverview3D.jsx';

/**
 * Sky View container: 2D polar sky chart (looking down) + 3D lander sky dome.
 * Supports native Fullscreen API with Esc to exit and a position:fixed fallback
 * ("expanded" mode) for browsers without Fullscreen API (e.g., iOS Safari).
 */

const SUN_COLOR = '#FFD700';
const EARTH_COLOR = '#4169E1';
const SAT_COLOR = '#c0c8d8';
const PLOT_RADIUS = 140;
const SVG_SIZE = 2 * PLOT_RADIUS + 60;
const CENTER = SVG_SIZE / 2;
const SUN_DISC_R = 10;
const EARTH_DISC_R = 7;
const SAT_DISC_R = 5;

function azElToXY(az, el) {
  const r = ((90 - el) / 90) * PLOT_RADIUS;
  const rad = (az * Math.PI) / 180;
  return { x: CENTER + r * Math.sin(rad), y: CENTER - r * Math.cos(rad) };
}

function trackPoints(azArr, elArr, start, end) {
  const pts = [];
  for (let i = start; i < end; i++) {
    const { x, y } = azElToXY(azArr[i], elArr[i]);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(' ');
}

function horizonsToSatIdx(horizonsIdx, site, satResult) {
  if (!satResult || satResult.elevations.length === 0) return null;
  const stepMs = site.step_hours * 3600000;
  const siteT0 = new Date(site.start).getTime();
  const tMs = siteT0 + horizonsIdx * stepMs;
  const satT0 = new Date(satResult.timestamps[0]).getTime();
  const satStepMs = satResult.stepMinutes * 60000;
  const idx = Math.round((tMs - satT0) / satStepMs);
  if (idx < 0 || idx >= satResult.elevations.length) return null;
  return idx;
}

export default function PolarSkyView({
  site,
  timestamps,
  startIdx,
  endIdx,
  satResult,
  satAltitude,
  setSatAltitude,
  satStartAngle,
  setSatStartAngle,
}) {
  const containerRef = useRef(null);
  const [cursor, setCursor] = useState(startIdx);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState('2d'); // '2d' (default fallback) | '3d'
  const [webglError, setWebglError] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false); // fallback when Fullscreen API unavailable
  const intervalRef = useRef(null);
  const playSpeed = 150;

  const fullActive = isFullscreen || isExpanded;

  const handleWebGLError = useCallback(() => {
    setWebglError('WebGL unavailable — showing 2D view.');
    setMode('2d');
  }, []);

  // Sync native fullscreen state & handle Esc in fallback expanded mode
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement && document.fullscreenElement === containerRef.current));
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && isExpanded) setIsExpanded(false);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isExpanded]);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    if (isFullscreen) {
      try { await document.exitFullscreen(); } catch { /* ignore */ }
      return;
    }
    if (isExpanded) {
      setIsExpanded(false);
      return;
    }
    if (el.requestFullscreen) {
      try {
        await el.requestFullscreen();
        return;
      } catch {
        // Fallback to fixed-viewport expanded mode
      }
    }
    setIsExpanded(true);
  }, [isFullscreen, isExpanded]);

  useEffect(() => {
    setCursor((c) => Math.max(startIdx, Math.min(c, endIdx - 1)));
  }, [startIdx, endIdx]);

  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setCursor((c) => {
          if (c >= endIdx - 1) { setPlaying(false); return startIdx; }
          return c + 1;
        });
      }, playSpeed);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, startIdx, endIdx]);

  const handleSlider = useCallback((e) => { setCursor(Number(e.target.value)); setPlaying(false); }, []);
  const stepBack = useCallback(() => { setCursor((c) => Math.max(startIdx, c - 1)); setPlaying(false); }, [startIdx]);
  const stepForward = useCallback(() => { setCursor((c) => Math.min(endIdx - 1, c + 1)); setPlaying(false); }, [endIdx]);

  const sunTrack = useMemo(() => trackPoints(site.sun_az, site.sun_elev, startIdx, endIdx), [site, startIdx, endIdx]);
  const earthTrack = useMemo(() => trackPoints(site.earth_az, site.earth_elev, startIdx, endIdx), [site, startIdx, endIdx]);

  const sunPos = azElToXY(site.sun_az[cursor], site.sun_elev[cursor]);
  const earthPos = azElToXY(site.earth_az[cursor], site.earth_elev[cursor]);
  const sunAbove = site.sun_elev[cursor] > 0;
  const earthAbove = site.earth_elev[cursor] > 0;

  const satIdx = satResult ? horizonsToSatIdx(cursor, site, satResult) : null;
  const hasSat = satIdx != null && satIdx >= 0 && satIdx < (satResult?.elevations.length ?? 0);
  const satEl = hasSat ? satResult.elevations[satIdx] : null;
  const satAz = hasSat ? satResult.azimuths[satIdx] : null;
  const satAbove = hasSat && satEl > 0;
  const satPos = hasSat ? azElToXY(satAz, satEl) : null;

  const cardinals = [
    { label: 'N', angle: 0 },
    { label: 'E', angle: 90 },
    { label: 'S', angle: 180 },
    { label: 'W', angle: 270 },
  ];

  const containerClass = isExpanded
    ? 'fixed inset-0 z-50 bg-[#080e1c] p-4 flex flex-col gap-3'
    : isFullscreen
      ? 'w-screen h-screen bg-[#080e1c] p-4 flex flex-col gap-3'
      : 'bg-[#10172a] border border-gray-800 rounded-xl p-5 space-y-3';

  return (
    <div ref={containerRef} className={containerClass}>
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-white">
            Sky View ({mode === '3d' ? 'Lander 3D' : mode === 'moon' ? 'Moon 3D' : '2D — sky chart, looking down'})
          </h2>
          {hasSat && (
            <span className="text-[10px] text-gray-400 bg-gray-800/80 px-2 py-0.5 rounded">
              Example relay orbit
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {webglError && <span className="text-[11px] text-amber-400">{webglError}</span>}
          <div className="inline-flex rounded-md border border-gray-700 overflow-hidden text-xs">
            <button
              onClick={() => setMode('2d')}
              className={`px-2.5 py-1 min-h-[44px] sm:min-h-0 transition-colors ${mode === '2d' ? 'bg-yellow-500/20 text-yellow-300 font-semibold' : 'text-gray-400 hover:text-white'}`}
            >
              2D sky chart
            </button>
            <button
              onClick={() => { setWebglError(null); setMode('3d'); }}
              className={`px-2.5 py-1 min-h-[44px] sm:min-h-0 border-l border-gray-700 transition-colors ${mode === '3d' ? 'bg-yellow-500/20 text-yellow-300 font-semibold' : 'text-gray-400 hover:text-white'}`}
            >
              Lander 3D
            </button>
            <button
              onClick={() => { setWebglError(null); setMode('moon'); }}
              className={`px-2.5 py-1 min-h-[44px] sm:min-h-0 border-l border-gray-700 transition-colors ${mode === 'moon' ? 'bg-yellow-500/20 text-yellow-300 font-semibold' : 'text-gray-400 hover:text-white'}`}
            >
              Moon 3D
            </button>
          </div>
          <button
            onClick={toggleFullscreen}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1 min-h-[44px] sm:min-h-0 rounded-md border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors"
            aria-label={fullActive ? 'Exit full screen' : 'Full screen'}
          >
            {fullActive ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span>{fullActive ? 'Exit' : 'Full screen'}</span>
          </button>
        </div>
      </div>

      <div className={fullActive ? 'relative flex-1 min-h-0 flex flex-col items-center justify-center' : 'flex flex-col items-center gap-3'}>
        {mode === '3d' ? (
          <SkyDome3D
            site={site}
            startIdx={startIdx}
            endIdx={endIdx}
            cursor={cursor}
            satResult={satResult}
            satIdx={satIdx}
            satEl={satEl}
            satAz={satAz}
            onWebGLError={handleWebGLError}
            heightClass={fullActive ? 'h-full' : 'h-[360px]'}
          />
        ) : mode === 'moon' ? (
          <MoonOverview3D
            site={site}
            timestamps={timestamps}
            cursor={cursor}
            startIdx={startIdx}
            satAltitude={satAltitude}
            satStartAngle={satStartAngle}
            onWebGLError={handleWebGLError}
            heightClass={fullActive ? 'h-full' : 'h-[360px]'}
          />
        ) : (
        <svg
          width={SVG_SIZE} height={SVG_SIZE}
          viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
          className={fullActive ? 'max-h-[68vh] w-auto max-w-full' : 'max-w-full'}
          aria-label="Polar sky projection showing Sun, Earth and satellite positions"
        >
          <circle cx={CENTER} cy={CENTER} r={PLOT_RADIUS + 20} fill="#080e1c" />

          {[30, 60].map((el) => {
            const r = ((90 - el) / 90) * PLOT_RADIUS;
            return <circle key={el} cx={CENTER} cy={CENTER} r={r} fill="none" stroke="#1e2d4a" strokeWidth={0.5} strokeDasharray="4 4" />;
          })}
          {[30, 60].map((el) => {
            const r = ((90 - el) / 90) * PLOT_RADIUS;
            return <text key={`l-${el}`} x={CENTER + 4} y={CENTER - r - 2} fontSize={8} fill="#3b5278" fontFamily="monospace">{el}°</text>;
          })}

          <line x1={CENTER} y1={CENTER - PLOT_RADIUS} x2={CENTER} y2={CENTER + PLOT_RADIUS} stroke="#1e2d4a" strokeWidth={0.5} />
          <line x1={CENTER - PLOT_RADIUS} y1={CENTER} x2={CENTER + PLOT_RADIUS} y2={CENTER} stroke="#1e2d4a" strokeWidth={0.5} />

          <circle cx={CENTER} cy={CENTER} r={PLOT_RADIUS} fill="none" stroke="#4b6fa0" strokeWidth={2} />
          <circle cx={CENTER} cy={CENTER} r={2} fill="#4b6fa0" />

          {cardinals.map(({ label, angle }) => {
            const rad = (angle * Math.PI) / 180;
            const lx = CENTER + (PLOT_RADIUS + 14) * Math.sin(rad);
            const ly = CENTER - (PLOT_RADIUS + 14) * Math.cos(rad);
            return <text key={label} x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight="bold" fill="#8ba4c8" fontFamily="sans-serif">{label}</text>;
          })}

          <polyline points={sunTrack} fill="none" stroke={SUN_COLOR} strokeWidth={0.7} opacity={0.15} />
          <polyline points={earthTrack} fill="none" stroke={EARTH_COLOR} strokeWidth={0.7} opacity={0.15} />

          <circle cx={earthPos.x} cy={earthPos.y} r={EARTH_DISC_R}
            fill={earthAbove ? EARTH_COLOR : 'transparent'} stroke={EARTH_COLOR}
            strokeWidth={earthAbove ? 0 : 1.5} strokeDasharray={earthAbove ? 'none' : '3 2'}
            opacity={earthAbove ? 1 : 0.25} />
          <text x={earthPos.x} y={earthPos.y + EARTH_DISC_R + 11} textAnchor="middle" fontSize={9}
            fill={EARTH_COLOR} opacity={earthAbove ? 0.9 : 0.3} fontFamily="sans-serif">Earth</text>

          {satPos && (
            <>
              <circle cx={satPos.x} cy={satPos.y} r={SAT_DISC_R}
                fill={satAbove ? SAT_COLOR : 'transparent'} stroke={SAT_COLOR}
                strokeWidth={satAbove ? 0 : 1} strokeDasharray={satAbove ? 'none' : '2 2'}
                opacity={satAbove ? 0.9 : 0.2} />
              <text x={satPos.x} y={satPos.y - SAT_DISC_R - 4} textAnchor="middle" fontSize={7}
                fill={SAT_COLOR} opacity={satAbove ? 0.8 : 0.25} fontFamily="sans-serif">Relay</text>
            </>
          )}

          <circle cx={sunPos.x} cy={sunPos.y} r={SUN_DISC_R}
            fill={sunAbove ? SUN_COLOR : 'transparent'} stroke={SUN_COLOR}
            strokeWidth={sunAbove ? 0 : 1.5} strokeDasharray={sunAbove ? 'none' : '3 2'}
            opacity={sunAbove ? 1 : 0.25} />
          <text x={sunPos.x} y={sunPos.y + SUN_DISC_R + 11} textAnchor="middle" fontSize={9}
            fill={SUN_COLOR} opacity={sunAbove ? 0.9 : 0.3} fontFamily="sans-serif">Sun</text>
        </svg>
        )}

        {/* Controls: normal flow in card, or bottom overlay in full screen */}
        <div className={fullActive
          ? 'absolute bottom-3 left-3 right-3 bg-[#0b1222]/90 backdrop-blur border border-gray-700/80 rounded-lg p-3 flex flex-col items-center gap-2'
          : 'w-full flex flex-col items-center gap-2'
        }>
          <div className="text-center space-y-0.5">
            <p className="text-xs font-mono text-gray-200">
              {fullActive ? `${site.name} · ` : ''}{timestamps[cursor]}
            </p>
            <p className="text-[10px] text-gray-400">
              Sun: el {site.sun_elev[cursor].toFixed(1)}° az {site.sun_az[cursor].toFixed(1)}°
              {' · '}
              Earth: el {site.earth_elev[cursor].toFixed(1)}° az {site.earth_az[cursor].toFixed(1)}°
              {hasSat && <> {' · '} Sat: el {satEl.toFixed(1)}° az {satAz.toFixed(1)}°</>}
            </p>
          </div>

          <div className="flex items-center gap-2 w-full max-w-lg">
            <button onClick={stepBack} className="p-2.5 sm:p-1.5 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center rounded-md border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors" aria-label="Step back">
              <SkipBack className="w-4 h-4" />
            </button>
            <button onClick={() => setPlaying((p) => !p)}
              className={`p-2.5 sm:p-1.5 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center rounded-md border transition-colors ${playing ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300' : 'border-gray-700 text-gray-300 hover:text-white hover:border-gray-500'}`}
              aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button onClick={stepForward} className="p-2.5 sm:p-1.5 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center rounded-md border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors" aria-label="Step forward">
              <SkipForward className="w-4 h-4" />
            </button>
            <input type="range" min={startIdx} max={endIdx - 1} value={cursor} onChange={handleSlider} className="flex-1 accent-yellow-500 h-1.5" />
          </div>

          {fullActive && setSatAltitude && setSatStartAngle && (
            <div className="grid grid-cols-2 gap-3 w-full max-w-lg pt-1 border-t border-gray-800">
              <label className="text-[10px] text-gray-300 flex flex-col gap-0.5">
                <span>Relay altitude: {satAltitude} km</span>
                <input type="range" min={50} max={300} step={10} value={satAltitude}
                  onChange={(e) => setSatAltitude(Number(e.target.value))}
                  className="w-full accent-gray-400 h-1.5" />
              </label>
              <label className="text-[10px] text-gray-300 flex flex-col gap-0.5">
                <span>Orbit start angle: {satStartAngle}°</span>
                <input type="range" min={0} max={350} step={10} value={satStartAngle}
                  onChange={(e) => setSatStartAngle(Number(e.target.value))}
                  className="w-full accent-gray-400 h-1.5" />
              </label>
            </div>
          )}

          <p className="text-[10px] text-gray-500 italic text-center">
            {mode === 'moon'
              ? 'Sizes and distances not to scale. Example relay orbit.'
              : 'Sizes enlarged for visibility, not to scale.'}
          </p>
        </div>
      </div>
    </div>
  );
}
