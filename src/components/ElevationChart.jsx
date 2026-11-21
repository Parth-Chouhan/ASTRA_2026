import React from 'react';
import Plot from 'react-plotly.js';

/**
 * ElevationChart – Plotly elevation chart windowed to the analysis range.
 * Sun = #FFD700 (yellow), Earth = #4169E1 (blue).
 */
export default function ElevationChart({ site, timestamps, startIdx, endIdx }) {
  if (!site) return null;

  const slicedTimestamps = timestamps.slice(startIdx, endIdx);
  const slicedSun = site.sun_elev.slice(startIdx, endIdx);
  const slicedEarth = site.earth_elev.slice(startIdx, endIdx);

  return (
    <div className="bg-[#10172a] border border-gray-800 rounded-xl p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white tracking-wide">
            Elevation Above Local Horizon ({site.name})
          </h2>
          <p className="text-xs text-gray-400">
            Yellow = Sun (Power) | Blue = Earth (Comms) | Dashed = Horizon (0°)
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs font-medium">
          <span className="flex items-center gap-1.5 text-yellow-400">
            <span className="w-3 h-0.5 bg-yellow-400 inline-block"></span> Sun
          </span>
          <span className="flex items-center gap-1.5 text-blue-400">
            <span className="w-3 h-0.5 bg-blue-400 inline-block"></span> Earth
          </span>
        </div>
      </div>

      <div className="w-full h-[350px]">
        <Plot
          data={[
            {
              x: slicedTimestamps,
              y: slicedSun,
              type: 'scatter',
              mode: 'lines',
              name: 'Sun Elevation',
              line: { color: '#FFD700', width: 2 },
              hoverinfo: 'x+y',
            },
            {
              x: slicedTimestamps,
              y: slicedEarth,
              type: 'scatter',
              mode: 'lines',
              name: 'Earth Elevation',
              line: { color: '#4169E1', width: 2 },
              hoverinfo: 'x+y',
            },
          ]}
          layout={{
            autosize: true,
            margin: { l: 50, r: 25, t: 10, b: 45 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'rgba(15, 23, 42, 0.6)',
            xaxis: {
              gridcolor: 'rgba(51, 65, 85, 0.4)',
              color: '#94a3b8',
              zeroline: false,
              showline: true,
              linecolor: '#334155',
            },
            yaxis: {
              title: { text: 'Elevation (°)', font: { color: '#94a3b8', size: 12 } },
              range: [-90, 90],
              gridcolor: 'rgba(51, 65, 85, 0.4)',
              color: '#94a3b8',
              zeroline: true,
              zerolinecolor: 'rgba(239, 68, 68, 0.8)',
              zerolinewidth: 1.5,
              showline: true,
              linecolor: '#334155',
            },
            shapes: [
              {
                type: 'line',
                xref: 'paper',
                x0: 0, x1: 1, y0: 0, y1: 0,
                line: { color: '#ef4444', width: 1.5, dash: 'dash' },
              },
            ],
            showlegend: false,
            hovermode: 'x unified',
          }}
          useResizeHandler={true}
          style={{ width: '100%', height: '100%' }}
          config={{ responsive: true, displayModeBar: false }}
        />
      </div>
    </div>
  );
}
