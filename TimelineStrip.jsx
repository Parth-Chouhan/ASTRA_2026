import React from 'react';

/**
 * TimelineStrip – Sun / Earth / "both available" / optional Relay bars
 * over the analysis window.
 * Drawn as SVG with one rect per continuous "up" run (fast even for a full year).
 *
 * Sun = #FFD700, Earth = #4169E1, Both = #10b981, Relay = #c0c8d8
 * Flat-horizon assumption: elevation > 0 means above horizon.
 */
function runs(count, testFn) {
  const out = [];
  let s = -1;
  for (let k = 0; k < count; k++) {
    const on = testFn(k);
    if (on && s < 0) s = k;
    if (!on && s >= 0) { out.push([s, k]); s = -1; }
  }
  if (s >= 0) out.push([s, count]);
  return out;
}

/**
 * Map a Horizons window index (k, 0-based within the window, 2h steps)
 * to a satellite result index (2min steps).
 */
function horizonsKToSatIdx(k, startIdx, site, satResult) {
  if (!satResult || satResult.elevations.length === 0) return -1;
  const stepMs = site.step_hours * 3600000;
  const siteT0 = new Date(site.start).getTime();
  const tMs = siteT0 + (startIdx + k) * stepMs;
  const satT0 = new Date(satResult.timestamps[0]).getTime();
  const satStepMs = satResult.stepMinutes * 60000;
  const idx = Math.round((tMs - satT0) / satStepMs);
  if (idx < 0 || idx >= satResult.elevations.length) return -1;
  return idx;
}

export default function TimelineStrip({
  sunElev, earthElev, startIdx, windowLen, darkBlock, cursorIdx,
  satResult, site,
}) {
  const end = Math.min(startIdx + windowLen, sunElev.length);
  const count = end - startIdx;
  if (count <= 0) return null;

  const rows = [
    { label: 'Sun', color: '#FFD700', fn: (k) => sunElev[startIdx + k] > 0 },
    { label: 'Earth', color: '#4169E1', fn: (k) => earthElev[startIdx + k] > 0 },
    { label: 'Both', color: '#10b981', fn: (k) => sunElev[startIdx + k] > 0 && earthElev[startIdx + k] > 0 },
  ];

  // Add relay bar if satellite data is present
  if (satResult && satResult.relayUsable && satResult.relayUsable.length > 0 && site) {
    rows.push({
      label: 'Relay',
      color: '#c0c8d8',
      fn: (k) => {
        const si = horizonsKToSatIdx(k, startIdx, site, satResult);
        return si >= 0 && satResult.relayUsable[si];
      },
    });
  }

  return (
    <div className="space-y-2 w-full">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="w-10 text-[10px] text-gray-400 uppercase tracking-wider shrink-0">{r.label}</span>
          <svg viewBox={`0 0 ${count} 10`} preserveAspectRatio="none"
            className="flex-1 h-4 rounded border border-gray-700/50 bg-white/[0.03]">
            {runs(count, r.fn).map(([a, b]) => (
              <rect key={a} x={a} y={0} width={b - a} height={10} fill={r.color} />
            ))}
            {r.label === 'Sun' && darkBlock && darkBlock.length > 0 && (
              <rect x={darkBlock.start - startIdx} y={0.5} width={darkBlock.length} height={9}
                fill="rgba(239,68,68,0.25)" stroke="#ef4444" strokeWidth={Math.max(0.5, count / 400)} />
            )}
            {cursorIdx != null && cursorIdx >= startIdx && cursorIdx < end && (
              <rect x={cursorIdx - startIdx} y={0} width={Math.max(1, count / 300)} height={10} fill="#fff" />
            )}
          </svg>
        </div>
      ))}
      {darkBlock && darkBlock.length > 0 && (
        <p className="text-[10px] text-red-300 pl-12">
          Red outline on Sun bar = longest darkness block ({darkBlock.hours} h)
        </p>
      )}
    </div>
  );
}
