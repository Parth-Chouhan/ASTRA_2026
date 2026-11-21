import React from 'react';
import { Compass, Sun, Globe, Radio, Moon, ExternalLink } from 'lucide-react';
import explorerData from '../../data/explorer.json';

/**
 * ExplorerPanel – plain-language guide for a general audience.
 * 1. Explains each metric and why it matters for a lunar lander.
 * 2. Generates a "What this means here" summary strictly from computed numbers.
 * 3. Displays Canadian Space Agency facts from explorer.json where verified === true.
 */

const METRIC_GUIDES = [
  {
    icon: <Sun className="w-4 h-4 text-yellow-400 shrink-0" />,
    title: 'Sunlit % (Power)',
    body: 'How often the Sun is above a flat horizon. Solar-powered landers need sunlight to charge batteries and keep electronics warm.',
  },
  {
    icon: <Globe className="w-4 h-4 text-blue-400 shrink-0" />,
    title: 'Earth-visible % (Direct communication)',
    body: 'How often Earth is in the sky. A lander needs a direct line of sight to Earth to send data and receive commands without a relay.',
  },
  {
    icon: <Compass className="w-4 h-4 text-emerald-400 shrink-0" />,
    title: 'Both available % (Power + Comms together)',
    body: 'How often both the Sun and Earth are above the horizon at the same time — the easiest periods to operate instruments and transmit live data.',
  },
  {
    icon: <Moon className="w-4 h-4 text-amber-300 shrink-0" />,
    title: 'Longest darkness (Surviving the lunar night)',
    body: 'The longest unbroken stretch without sunlight. Without sun, temperatures plunge and a lander must rely on batteries or heaters to survive.',
  },
  {
    icon: <Radio className="w-4 h-4 text-gray-300 shrink-0" />,
    title: 'Relay coverage (Example relay orbit)',
    body: 'How often an orbiting relay satellite is above the lander AND can see Earth at the same time, extending communication when Earth is hidden.',
  },
];

function buildWhatThisMeans(site, windowDays, startDate, m, satResult) {
  const earthText =
    m.earth >= 99
      ? `Earth stays above the horizon ${m.earth.toFixed(1)}% of the time, so direct communication is continuously available.`
      : m.earth <= 0.1
        ? `Earth is above the horizon ${m.earth.toFixed(1)}% of the time, meaning direct communication with Earth is not possible from this site.`
        : `Earth is above the horizon ${m.earth.toFixed(1)}% of the time, with a longest direct-comms gap of ${m.earthGap.toFixed(0)} hours.`;

  const darkText = `The Sun is above the flat horizon ${m.sun.toFixed(1)}% of the time, with both Sun and Earth up together ${m.both.toFixed(1)}% of the time, and a longest continuous darkness of ${m.dark.toFixed(0)} hours.`;

  const relayText = satResult
    ? ` With the example relay orbit, a usable relay link is available ${satResult.relayUsablePercent.toFixed(1)}% of the time${satResult.combinedPercent != null ? ` (${satResult.combinedPercent.toFixed(1)}% combined with direct Earth line-of-sight)` : ''}.`
    : '';

  return `At ${site.name} over the ${windowDays}-day window starting ${startDate}: ${earthText} ${darkText}${relayText}`;
}

export default function ExplorerPanel({ site, startDate, windowDays, m, satResult }) {
  const verifiedFacts = (explorerData?.facts ?? []).filter((f) => f.verified === true);

  return (
    <section className="bg-[#10172a] border border-cyan-800/60 rounded-xl p-4 sm:p-5 space-y-5">
      <div className="flex items-center gap-2">
        <Compass className="w-4 h-4 text-cyan-400" />
        <h2 className="text-sm font-semibold text-white">Explorer Mode — Plain-Language Guide</h2>
      </div>

      {/* What this means here */}
      <div className="bg-[#0b1222] border border-cyan-900/50 rounded-lg p-4 space-y-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-300">What this means here</h3>
        <p className="text-sm text-gray-200 leading-relaxed">
          {buildWhatThisMeans(site, windowDays, startDate, m, satResult)}
        </p>
      </div>

      {/* Metric explanations */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {METRIC_GUIDES.map((g) => (
          <div key={g.title} className="bg-[#0d1424] border border-gray-800 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-2">
              {g.icon}
              <h4 className="text-xs font-semibold text-white">{g.title}</h4>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">{g.body}</p>
          </div>
        ))}
      </div>

      {/* Canadian Space Agency facts (only verified: true shown) */}
      <div className="border-t border-gray-800 pt-4 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Canadian Space Agency Facts
        </h3>
        <p className="text-[11px] text-gray-400">Source: Canadian Space Agency</p>
        {verifiedFacts.length > 0 ? (
          <ul className="space-y-2">
            {verifiedFacts.map((fact, idx) => (
              <li key={idx} className="bg-[#0d1424] border border-gray-800 rounded-lg p-3 text-xs text-gray-200 space-y-1">
                <p className="leading-relaxed">{fact.text}</p>
                <a
                  href={fact.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:underline"
                >
                  {fact.source_title} <ExternalLink className="w-3 h-3" />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-gray-500 italic">
            CSA facts are currently marked unverified in explorer.json and will appear here once human-verified.
          </p>
        )}
      </div>
    </section>
  );
}

