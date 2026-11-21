import React from 'react';

/**
 * DateRangeControl – analysis start date + window length (days).
 */
export default function DateRangeControl({ startDate, setStartDate, windowDays, setWindowDays, minDate, maxDate, maxDays = 365 }) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Analysis date</label>
        <input type="date" value={startDate} min={minDate} max={maxDate}
          onChange={(e) => e.target.value && setStartDate(e.target.value)}
          className="bg-[#162038] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50" />
      </div>
      <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
        <label className="text-xs text-gray-400 uppercase tracking-wider font-semibold">
          Window: {windowDays} days
        </label>
        <input type="range" min={1} max={maxDays} value={windowDays}
          onChange={(e) => setWindowDays(Number(e.target.value))}
          className="w-full accent-yellow-500 cursor-pointer" />
      </div>
    </div>
  );
}
