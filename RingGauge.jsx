import React from 'react';

/**
 * RingGauge – SVG circular gauge drawn by us (no chart library).
 * Props: value (0–100), label, color, size (px), note (optional footnote)
 */
export default function RingGauge({ value, label, color, size = 120, note }) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const v = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const offset = circumference - (v / 100) * circumference;
  const center = size / 2;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={center} cy={center} r={radius} fill="none"
            stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} />
          <circle cx={center} cy={center} r={radius} fill="none"
            stroke={color} strokeWidth={strokeWidth}
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round" className="transition-all duration-500" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-bold font-mono" style={{ color, fontSize: size * 0.18 }}>
            {v.toFixed(1)}%
          </span>
        </div>
      </div>
      <span className="text-xs text-gray-300 font-semibold mt-1">{label}</span>
      {note && <span className="text-[10px] text-gray-500 max-w-[150px] text-center leading-tight">{note}</span>}
    </div>
  );
}
