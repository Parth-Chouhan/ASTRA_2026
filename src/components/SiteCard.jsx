import React, { useState } from 'react';
import { MapPin, AlertTriangle, Info, ImageOff } from 'lucide-react';

/**
 * SiteCard – site image (web/public/<id>.png, placeholder if missing),
 * coordinates, coordinate source, TODO_VERIFY and reference-point notices.
 */
export default function SiteCard({ site }) {
  const [failedFor, setFailedFor] = useState(null);
  if (!site) return null;

  const imgMissing = failedFor === site.id;
  const isTodoVerify = site.source?.startsWith('TODO_VERIFY');
  const isReference = site.id === 'south_pole';
  const fmt = (v, pos, neg) => `${Math.abs(v).toFixed(4)}°${v >= 0 ? pos : neg}`;

  return (
    <div className="bg-[#10172a] border border-gray-800 rounded-xl p-5 flex flex-col sm:flex-row gap-4">
      <div className="w-full sm:w-48 shrink-0 space-y-1">
        <div className="w-full h-36 rounded-lg overflow-hidden bg-[#0a0f1e] border border-gray-800 flex items-center justify-center">
          {imgMissing ? (
            <div className="flex flex-col items-center gap-1 text-gray-600">
              <ImageOff className="w-8 h-8" />
              <span className="text-[10px]">No image ({site.id}.png)</span>
            </div>
          ) : (
            <img src={`${import.meta.env.BASE_URL}${site.id}.png`} alt={site.name} className="w-full h-full object-cover"
              onError={() => setFailedFor(site.id)} />
          )}
        </div>
        <p className="text-[10px] text-gray-500 leading-tight">
          Image: LROC Quickmap (NASA/GSFC/Arizona State University)
        </p>
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <MapPin className="w-4 h-4 text-gray-400" /> {site.name}
        </h3>
        <p className="text-xs font-mono text-gray-300">
          {fmt(site.lat, 'N', 'S')}, {fmt(site.lon, 'E', 'W')} · step {site.step_hours} h
        </p>
        <div>
          <span className="text-[10px] uppercase tracking-wider text-gray-500">Coordinate source</span>
          <p className="text-[11px] font-mono text-gray-300 bg-gray-900/60 p-1.5 rounded border border-gray-800 break-words">
            {site.source || '—'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {isTodoVerify && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono text-[10px] rounded font-semibold">
              <AlertTriangle className="w-3 h-3" /> TODO_VERIFY: coordinates unconfirmed
            </span>
          )}
          {isReference && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/20 border border-blue-500/40 text-blue-300 font-mono text-[10px] rounded font-semibold">
              <Info className="w-3 h-3" /> Reference point, not a landing site
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
