import React from 'react';

/**
 * LaunchSlipCalendar – heatmap of per-day both-available % over the data year.
 * Laid out as weeks (columns) × weekday (rows) like a contribution graph.
 * Click a day to set the analysis start date. The current window is outlined.
 * Colour: red (0%) → yellow (50%) → green (100%).
 */
export function pctToColor(pct) {
  if (pct <= 0) return 'rgb(127, 29, 29)';
  if (pct >= 100) return 'rgb(16, 185, 129)';
  if (pct < 50) {
    const t = pct / 50;
    return `rgb(${Math.round(185 + 70 * t)},${Math.round(28 + 187 * t)},${Math.round(28 * (1 - t))})`;
  }
  const t = (pct - 50) / 50;
  return `rgb(${Math.round(255 * (1 - t) + 16 * t)},${Math.round(215 * (1 - t) + 185 * t)},${Math.round(129 * t)})`;
}

export default function LaunchSlipCalendar({ dailyBothPercent, dataStartIso, selectedDayIdx, windowDays, onDayClick }) {
  if (!dailyBothPercent || dailyBothPercent.length === 0) return null;
  const base = new Date(dataStartIso);
  const offset = base.getUTCDay(); // weekday of day 0
  const weeks = Math.ceil((dailyBothPercent.length + offset) / 7);
  const cell = 12, gap = 2;
  const W = weeks * (cell + gap), H = 7 * (cell + gap) + 14;
  const months = [];
  dailyBothPercent.forEach((_, i) => {
    const d = new Date(base.getTime() + i * 86400000);
    if (d.getUTCDate() === 1 || i === 0) months.push({ i, label: d.toLocaleString('en', { month: 'short', timeZone: 'UTC' }) });
  });

  return (
    <div className="bg-[#10172a] border border-gray-800 rounded-xl p-5 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-white tracking-wide">Launch-slip calendar</h2>
        <p className="text-xs text-gray-400">
          Daily both-available % (Sun AND Earth above a flat horizon). Click a day to set the analysis date.
        </p>
      </div>
      <div className="overflow-x-auto">
        <svg width={W} height={H} className="block">
          {months.map((m) => (
            <text key={m.i} x={Math.floor((m.i + offset) / 7) * (cell + gap)} y={10} fontSize={9} fill="#94a3b8">{m.label}</text>
          ))}
          {dailyBothPercent.map((pct, i) => {
            const k = i + offset;
            const x = Math.floor(k / 7) * (cell + gap);
            const y = 14 + (k % 7) * (cell + gap);
            const inWin = selectedDayIdx != null && i >= selectedDayIdx && i < selectedDayIdx + windowDays;
            const d = new Date(base.getTime() + i * 86400000).toISOString().slice(0, 10);
            return (
              <rect key={i} x={x} y={y} width={cell} height={cell} rx={2}
                fill={pctToColor(pct)} opacity={inWin ? 1 : 0.55}
                stroke={i === selectedDayIdx ? '#fff' : inWin ? 'rgba(255,255,255,0.5)' : 'none'}
                strokeWidth={i === selectedDayIdx ? 2 : 1}
                className="cursor-pointer" onClick={() => onDayClick(d)}>
                <title>{`${d}: ${pct.toFixed(1)}% both available`}</title>
              </rect>
            );
          })}
        </svg>
      </div>
      <div className="flex gap-1.5 items-center max-w-xs">
        <span className="text-[10px] text-gray-500">0%</span>
        <div className="flex h-2.5 flex-1 rounded overflow-hidden">
          {Array.from({ length: 20 }, (_, i) => (
            <div key={i} style={{ flex: 1, backgroundColor: pctToColor((i / 19) * 100) }} />
          ))}
        </div>
        <span className="text-[10px] text-gray-500">100%</span>
        <span className="text-[10px] text-gray-500 ml-2">bright = in window</span>
      </div>
    </div>
  );
}
