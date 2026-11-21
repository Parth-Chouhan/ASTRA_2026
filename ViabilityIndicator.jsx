import React from 'react';
import { ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';

/**
 * Viability rule (shown on screen):
 *   Green:  both-up >= 40% AND longest darkness <= max survivable darkness
 *   Yellow: both-up >= 20% OR  longest darkness <= 1.5 × max survivable darkness
 *   Red:    otherwise
 */
export function viabilityLevel(bothPercent, longestDarkness, maxDarknessHours) {
  if (bothPercent >= 40 && longestDarkness <= maxDarknessHours) return 'green';
  if (bothPercent >= 20 || longestDarkness <= maxDarknessHours * 1.5) return 'yellow';
  return 'red';
}

const STYLE = {
  green: ['bg-emerald-500/10', 'border-emerald-500/40', 'text-emerald-400', ShieldCheck, 'Green: promising'],
  yellow: ['bg-amber-500/10', 'border-amber-500/40', 'text-amber-400', ShieldAlert, 'Yellow: marginal'],
  red: ['bg-red-500/10', 'border-red-500/40', 'text-red-400', ShieldX, 'Red: poor'],
};

export default function ViabilityIndicator({ bothPercent, longestDarkness, maxDarknessHours, setMaxDarknessHours }) {
  const level = viabilityLevel(bothPercent, longestDarkness, maxDarknessHours);
  const [bg, border, text, Icon, label] = STYLE[level];

  return (
    <div className={`${bg} border ${border} rounded-xl p-4 flex flex-col items-center gap-2`}>
      <Icon className={`w-8 h-8 ${text}`} />
      <span className={`text-lg font-bold ${text}`}>{label}</span>
      <p className="text-[11px] text-gray-300 font-mono">
        both {bothPercent.toFixed(1)}% · darkness {longestDarkness.toFixed(0)} h
      </p>
      <label className="text-[10px] text-gray-400 uppercase tracking-wider text-center">
        Max darkness the lander can survive (hours)
      </label>
      <input type="number" min={0} max={2000} value={maxDarknessHours}
        onChange={(e) => setMaxDarknessHours(Math.max(0, Number(e.target.value)))}
        className="w-24 bg-[#162038] border border-gray-700 rounded px-2 py-1 text-sm text-center text-white focus:outline-none focus:ring-1 focus:ring-yellow-500/50" />
      <div className="text-[10px] text-gray-400 leading-tight text-center mt-1 space-y-0.5">
        <p className="font-semibold text-gray-300">Rule</p>
        <p>Green: both ≥ 40% AND darkness ≤ max</p>
        <p>Yellow: both ≥ 20% OR darkness ≤ 1.5 × max</p>
        <p>Red: otherwise</p>
      </div>
    </div>
  );
}
