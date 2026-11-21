import React from 'react';
import { Satellite } from 'lucide-react';
import RingGauge from './RingGauge.jsx';

/**
 * SatellitePanel – controls and metrics for the example relay orbit.
 * Shows altitude/angle sliders, a "whole year" button, and gauges for
 * passes/day, avg pass, longest gap, combined coverage, and relay-usable %.
 */
export default function SatellitePanel({
  altitudeKm, setAltitudeKm,
  startAngle, setStartAngle,
  satResult,
  onWholeYear,
  isWholeYear,
}) {
  if (!satResult) return null;

  const fmt = (v, u) => v != null ? `${v.toFixed(1)}${u}` : '—';

  return (
    <div className="bg-[#10172a] border border-gray-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Satellite className="w-4 h-4 text-gray-300" />
        <h2 className="text-sm font-semibold text-white">Example Relay Orbit</h2>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
            Altitude: {altitudeKm} km
          </label>
          <input type="range" min={50} max={300} step={10} value={altitudeKm}
            onChange={(e) => setAltitudeKm(Number(e.target.value))}
            className="w-full accent-gray-400 h-1.5" />
          <div className="flex justify-between text-[9px] text-gray-500">
            <span>50 km</span><span>300 km</span>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
            Start angle: {startAngle}°
          </label>
          <input type="range" min={0} max={350} step={10} value={startAngle}
            onChange={(e) => setStartAngle(Number(e.target.value))}
            className="w-full accent-gray-400 h-1.5" />
          <div className="flex justify-between text-[9px] text-gray-500">
            <span>0°</span><span>350°</span>
          </div>
        </div>

        <div className="flex flex-col justify-end">
          <button onClick={onWholeYear}
            className={`text-xs px-3 py-2 rounded-md border transition-colors ${
              isWholeYear
                ? 'bg-gray-500/20 border-gray-500/50 text-gray-200'
                : 'border-gray-700 text-gray-300 hover:text-white hover:border-gray-500'
            }`}>
            {isWholeYear ? 'Using whole year' : 'Whole year'}
          </button>
          <p className="text-[9px] text-gray-500 mt-1">
            Period: {fmt(satResult.periodMinutes, ' min')}
          </p>
        </div>
      </div>

      {/* Gauges row */}
      <div className="flex flex-wrap justify-around gap-4">
        <RingGauge value={satResult.satVisiblePercent} label="Sat visible" color="#c0c8d8" size={100} />
        <RingGauge value={satResult.relayUsablePercent} label="Relay usable" color="#8ba4c8" size={100}
          note="Visible + sees Earth" />
        {satResult.combinedPercent != null && (
          <RingGauge value={satResult.combinedPercent} label="Combined coverage"
            color="#10b981" size={100}
            note="Earth direct OR relay" />
        )}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Passes/day" value={fmt(satResult.passesPerDay, '')} />
        <StatCard label="Avg pass" value={fmt(satResult.avgPassMinutes, ' min')} />
        <StatCard label="Longest gap" value={satResult.longestGapMinutes >= 1440
          ? `${(satResult.longestGapMinutes / 60).toFixed(0)} h`
          : `${satResult.longestGapMinutes.toFixed(0)} min`} />
        <StatCard label="Sat visible %" value={fmt(satResult.satVisiblePercent, '%')} />
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-[#0d1424] border border-gray-800 rounded-lg p-3 flex flex-col items-center gap-1">
      <span className="text-lg font-bold font-mono text-gray-200">{value}</span>
      <span className="text-[10px] text-gray-400 uppercase tracking-wider text-center">{label}</span>
    </div>
  );
}

