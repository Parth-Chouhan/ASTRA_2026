import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * LimitsFooter – honest limits + provenance & build date (CLAUDE.md rule 6).
 */
export default function LimitsFooter() {
  const buildDate = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : 'dev';
  return (
    <footer className="border-t border-gray-800 bg-[#0b0f19] px-4 sm:px-6 py-3 space-y-1.5">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-gray-400 text-center">
        <span className="flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 text-amber-500" />
          Limits: flat horizon assumed (no terrain shadows or crater-rim blocking).
        </span>
        <span>
          Power proxy <span className="font-mono text-yellow-400/80">sin(sun_elev)</span> is only a rough indicator.
        </span>
        <span>Example relay orbit, not a real mission design; Earth link approximated (Earth fixed at the sub-Earth point); orbit drift ignored.</span>
        <span>Sky view sizes enlarged for visibility, not to scale.</span>
      </div>
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] text-gray-500 text-center">
        <span>Data: JPL Horizons (2 h steps)</span>
        <span>Coordinates: LROC Quickmap</span>
        <span>CSA facts: Canadian Space Agency (asc-csa.gc.ca)</span>
        <span>Build: {buildDate}</span>
      </div>
    </footer>
  );
}
