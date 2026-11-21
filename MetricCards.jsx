import React from 'react';
import { Moon, Globe, Clock, ArrowDown } from 'lucide-react';

/**
 * MetricCards – longest darkness, longest Earth gap, countdown to next
 * sunset & Earthset from the selected date.
 */
export default function MetricCards({ longestDarkness, longestEarthGap, countdown }) {
  const cards = [
    {
      icon: <Moon className="w-4 h-4 text-yellow-400" />,
      label: 'Longest Darkness',
      value: `${longestDarkness.toFixed(0)}h`,
      color: 'text-yellow-400',
    },
    {
      icon: <Globe className="w-4 h-4 text-blue-400" />,
      label: 'Longest Earth Gap',
      value: `${longestEarthGap.toFixed(0)}h`,
      color: 'text-blue-400',
    },
    {
      icon: <ArrowDown className="w-4 h-4 text-amber-300" />,
      label: 'Next Sunset',
      value: countdown.sunsetHours != null ? `${countdown.sunsetHours.toFixed(0)}h` : '—',
      color: 'text-amber-300',
    },
    {
      icon: <ArrowDown className="w-4 h-4 text-blue-300" />,
      label: 'Next Earthset',
      value: countdown.earthsetHours != null ? `${countdown.earthsetHours.toFixed(0)}h` : '—',
      color: 'text-blue-300',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className="bg-[#0d1424] border border-gray-800 rounded-lg p-3 flex flex-col items-center gap-1"
        >
          {c.icon}
          <span className={`text-xl font-bold font-mono ${c.color}`}>{c.value}</span>
          <span className="text-[10px] text-gray-400 uppercase tracking-wider text-center">{c.label}</span>
        </div>
      ))}
    </div>
  );
}
